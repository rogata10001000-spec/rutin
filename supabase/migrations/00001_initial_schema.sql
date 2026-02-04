-- Rutin MVP Initial Schema
-- 要件定義書 16.1 に基づく全テーブル定義

-- =====================================================
-- 1. スタッフ (auth.usersと連携)
-- =====================================================
create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'supervisor', 'cast')),
  display_name text not null,
  active boolean not null default true,
  capacity_limit int null,
  style_summary text null,
  style_updated_at timestamptz null,
  accepting_new_users boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_profiles_role on public.staff_profiles(role);

comment on table public.staff_profiles is 'スタッフ情報（auth.usersと1:1）';
comment on column public.staff_profiles.role is 'ロール: admin/supervisor/cast';
comment on column public.staff_profiles.capacity_limit is 'キャスト担当上限（capacity_weight計算用）';
comment on column public.staff_profiles.style_summary is 'キャストの返信スタイル要約（AI返信案の文脈用）';

-- =====================================================
-- 2. プラン定義 (内容)
-- =====================================================
create table if not exists public.plans (
  plan_code text primary key,
  name text not null,
  reply_sla_minutes int not null,
  sla_warning_minutes int not null,
  daily_checkin_enabled boolean not null default true,
  weekly_review_enabled boolean not null default false,
  priority_level int not null,
  capacity_weight int not null,
  active boolean not null default true
);

comment on table public.plans is 'プラン定義（Light/Standard/Premium）';
comment on column public.plans.reply_sla_minutes is '返信SLA（分）: Light=1440, Standard=720, Premium=120';
comment on column public.plans.sla_warning_minutes is 'SLA警告閾値（分）: Light=240, Standard=120, Premium=30';

-- 初期プランデータ
insert into public.plans (plan_code, name, reply_sla_minutes, sla_warning_minutes, daily_checkin_enabled, weekly_review_enabled, priority_level, capacity_weight) values
  ('light', 'Light', 1440, 240, true, false, 3, 1),
  ('standard', 'Standard', 720, 120, true, true, 2, 2),
  ('premium', 'Premium', 120, 30, true, true, 1, 4)
on conflict (plan_code) do nothing;

-- =====================================================
-- 3. 税率
-- =====================================================
create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5,4) not null,
  effective_from date not null,
  active boolean not null default true
);

comment on table public.tax_rates is '税率マスタ（将来の税率変更に備える）';

-- 初期税率（10%）
insert into public.tax_rates (name, rate, effective_from) values
  ('JP Standard', 0.1000, '2019-10-01')
on conflict do nothing;

-- =====================================================
-- 4. エンドユーザー
-- =====================================================
create table if not exists public.end_users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  nickname text not null,
  birthday date null,
  status text not null check (status in ('trial', 'active', 'past_due', 'paused', 'canceled', 'incomplete')),
  plan_code text not null references public.plans(plan_code),
  assigned_cast_id uuid null references public.staff_profiles(id),
  paused_priority_penalty int not null default 0,
  tags text[] not null default '{}',
  trial_end_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_end_users_assigned_cast on public.end_users(assigned_cast_id);
create index if not exists idx_end_users_status on public.end_users(status);
create index if not exists idx_end_users_plan_code on public.end_users(plan_code);

comment on table public.end_users is 'エンドユーザー（LINE利用者）';
comment on column public.end_users.status is '契約状態: trial/active/past_due/paused/canceled/incomplete';
comment on column public.end_users.paused_priority_penalty is 'paused時のInbox優先度ペナルティ';

-- =====================================================
-- 5. 担当履歴
-- =====================================================
create table if not exists public.cast_assignments (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  from_cast_id uuid null references public.staff_profiles(id),
  to_cast_id uuid not null references public.staff_profiles(id),
  reason text null,
  shadow_until timestamptz null,
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_cast_assignments_end_user on public.cast_assignments(end_user_id, created_at desc);
create index if not exists idx_cast_assignments_to_cast on public.cast_assignments(to_cast_id, created_at desc);

comment on table public.cast_assignments is '担当キャスト変更履歴（改ざん防止のためupdate/delete禁止）';
comment on column public.cast_assignments.shadow_until is 'Shadow期間の終了日時（下書きのみ許可）';

-- =====================================================
-- 6. サブスク価格（デフォルト）
-- =====================================================
create table if not exists public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.plans(plan_code),
  currency text not null default 'JPY',
  amount_monthly int not null,
  stripe_price_id text unique not null,
  valid_from date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_prices_lookup on public.plan_prices(plan_code, active, valid_from desc);

comment on table public.plan_prices is 'プランのデフォルト価格（Stripe Price ID）';

-- =====================================================
-- 7. キャスト別プラン価格 (override)
-- =====================================================
create table if not exists public.cast_plan_price_overrides (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.staff_profiles(id),
  plan_code text not null references public.plans(plan_code),
  currency text not null default 'JPY',
  amount_monthly int not null,
  stripe_price_id text unique not null,
  valid_from date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cast_id, plan_code, valid_from)
);

comment on table public.cast_plan_price_overrides is 'キャスト別プラン価格（override）';

-- =====================================================
-- 8. サブスクリプション（Stripe同期）
-- =====================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique not null,
  status text not null check (status in ('trial', 'active', 'past_due', 'paused', 'canceled', 'incomplete')),
  plan_code text not null references public.plans(plan_code),
  applied_stripe_price_id text not null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_end_user on public.subscriptions(end_user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

comment on table public.subscriptions is 'サブスクリプション（Stripeと同期）';

-- =====================================================
-- 9. メッセージ（会話）
-- =====================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  line_message_id text null unique,
  sent_by_staff_id uuid null references public.staff_profiles(id),
  sent_as_proxy boolean not null default false,
  proxy_for_cast_id uuid null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_end_user on public.messages(end_user_id, created_at desc);
create index if not exists idx_messages_sent_by on public.messages(sent_by_staff_id, created_at desc);

comment on table public.messages is 'チャットメッセージ（in=ユーザーから, out=キャストから）';
comment on column public.messages.sent_as_proxy is '代理返信フラグ';
comment on column public.messages.proxy_for_cast_id is '代理返信時の本来担当キャストID';

-- =====================================================
-- 10. チェックイン
-- =====================================================
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('circle', 'triangle', 'cross')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (end_user_id, date)
);

create index if not exists idx_checkins_end_user on public.checkins(end_user_id, date desc);

comment on table public.checkins is '日次チェックイン（◯/△/×）';
comment on column public.checkins.status is 'circle=良い, triangle=普通, cross=悪い';

-- =====================================================
-- 11. メモ
-- =====================================================
create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  category text not null,
  pinned boolean not null default false,
  latest_body text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_memos_end_user on public.memos(end_user_id, pinned desc, updated_at desc);

comment on table public.memos is 'ユーザーメモ（カテゴリ別）';

-- =====================================================
-- 12. メモ履歴
-- =====================================================
create table if not exists public.memo_revisions (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  body text not null,
  edited_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_memo_revisions_memo on public.memo_revisions(memo_id, created_at desc);

comment on table public.memo_revisions is 'メモ編集履歴（改ざん防止のためupdate/delete禁止）';

-- =====================================================
-- 13. 誕生日お祝い送信フラグ
-- =====================================================
create table if not exists public.birthday_congrats (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  year int not null,
  sent_by uuid not null references public.staff_profiles(id),
  sent_at timestamptz not null default now(),
  unique (end_user_id, year)
);

comment on table public.birthday_congrats is '誕生日お祝い送信フラグ（年に1回）';

-- =====================================================
-- 14. AI返信案リクエスト
-- =====================================================
create table if not exists public.ai_draft_requests (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  requested_by uuid not null references public.staff_profiles(id),
  jst_date date not null,
  context_snapshot jsonb not null,
  success boolean not null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_draft_requests_end_user on public.ai_draft_requests(end_user_id, jst_date desc);

comment on table public.ai_draft_requests is 'AI返信案リクエスト（1日3回制限の判定に使用）';

-- =====================================================
-- 15. AI返信案
-- =====================================================
create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_draft_requests(id) on delete cascade,
  type text not null check (type in ('empathy', 'praise', 'suggest')),
  body text not null,
  created_at timestamptz not null default now()
);

comment on table public.ai_drafts is 'AI返信案（共感/称賛/提案の3案）';

-- =====================================================
-- 16. Shadow下書き
-- =====================================================
create table if not exists public.shadow_drafts (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  created_by uuid not null references public.staff_profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_shadow_drafts_end_user on public.shadow_drafts(end_user_id, created_at desc);

comment on table public.shadow_drafts is 'Shadow期間中のキャストが作成した下書き（送信不可）';

-- =====================================================
-- 17. 危険検知（将来拡張用、MVP除外）
-- =====================================================
create table if not exists public.risk_flags (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  detected_on_message_id uuid null references public.messages(id),
  risk_level int not null check (risk_level between 1 and 5),
  reasons text[] not null,
  status text not null check (status in ('open', 'ack', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_by uuid null references public.staff_profiles(id),
  resolved_at timestamptz null
);

create index if not exists idx_risk_flags_status on public.risk_flags(status, created_at desc);
create index if not exists idx_risk_flags_end_user on public.risk_flags(end_user_id, created_at desc);

comment on table public.risk_flags is '危険検知フラグ（MVP除外、将来拡張用）';

-- =====================================================
-- 18. ポイント商品
-- =====================================================
create table if not exists public.point_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points int not null,
  price_excl_tax_jpy int not null,
  tax_rate_id uuid not null references public.tax_rates(id),
  price_incl_tax_jpy int not null,
  stripe_price_id text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.point_products is 'ポイント購入商品（Stripe one-time）';

-- =====================================================
-- 19. ユーザーポイント台帳
-- =====================================================
create table if not exists public.user_point_ledger (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  delta_points int not null,
  reason text not null check (reason in ('purchase', 'gift_redeem', 'refund', 'chargeback', 'admin_adjust')),
  ref_type text not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  unique (reason, ref_type, ref_id)
);

create index if not exists idx_user_point_ledger_end_user on public.user_point_ledger(end_user_id, created_at desc);

comment on table public.user_point_ledger is 'ポイント台帳（残高=SUMで計算、冪等性保証）';

-- =====================================================
-- 20. ギフトカタログ
-- =====================================================
create table if not exists public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  cost_points int not null,
  icon text null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_gift_catalog_active on public.gift_catalog(active, sort_order);

comment on table public.gift_catalog is 'ギフト商品カタログ';

-- =====================================================
-- 21. ギフト送信
-- =====================================================
create table if not exists public.gift_sends (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  cast_id uuid not null references public.staff_profiles(id),
  gift_id uuid not null references public.gift_catalog(id),
  cost_points int not null,
  sent_at timestamptz not null default now(),
  message_id uuid null references public.messages(id)
);

create index if not exists idx_gift_sends_cast on public.gift_sends(cast_id, sent_at desc);
create index if not exists idx_gift_sends_end_user on public.gift_sends(end_user_id, sent_at desc);

comment on table public.gift_sends is 'ギフト送信記録';

-- =====================================================
-- 22. 売上認識イベント
-- =====================================================
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('gift_redeem', 'subscription_monthly', 'refund', 'chargeback', 'breakage')),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  cast_id uuid null references public.staff_profiles(id),
  occurred_on date not null,
  amount_excl_tax_jpy int not null,
  tax_rate_id uuid not null references public.tax_rates(id),
  tax_jpy int not null,
  amount_incl_tax_jpy int not null,
  source_ref_type text not null,
  source_ref_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (event_type, source_ref_type, source_ref_id)
);

create index if not exists idx_revenue_events_cast on public.revenue_events(cast_id, occurred_on desc);
create index if not exists idx_revenue_events_end_user on public.revenue_events(end_user_id, occurred_on desc);

comment on table public.revenue_events is '売上認識イベント（配分計算の分母）';

-- =====================================================
-- 23. 配分ルール
-- =====================================================
create table if not exists public.payout_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('gift_share', 'subscription_share')),
  scope_type text not null check (scope_type in ('global', 'cast', 'cast_gift', 'cast_gift_category', 'cast_plan')),
  cast_id uuid null references public.staff_profiles(id),
  gift_id uuid null references public.gift_catalog(id),
  gift_category text null,
  plan_code text null references public.plans(plan_code),
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  effective_from date not null,
  effective_to date null,
  active boolean not null default true,
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payout_rules_lookup on public.payout_rules(rule_type, scope_type, active, effective_from desc);
create index if not exists idx_payout_rules_cast on public.payout_rules(cast_id, rule_type, active, effective_from desc);

comment on table public.payout_rules is '配分ルール（global/cast別）';

-- =====================================================
-- 24. 配分計算結果
-- =====================================================
create table if not exists public.payout_calculations (
  id uuid primary key default gen_random_uuid(),
  revenue_event_id uuid not null references public.revenue_events(id) on delete cascade unique,
  cast_id uuid not null references public.staff_profiles(id),
  rule_id uuid not null references public.payout_rules(id),
  percent_snapshot numeric(5,2) not null,
  amount_jpy int not null,
  calculated_at timestamptz not null default now()
);

create index if not exists idx_payout_calculations_cast on public.payout_calculations(cast_id, calculated_at desc);

comment on table public.payout_calculations is '配分計算結果（ギフト送信時に即時計算）';

-- =====================================================
-- 25. 精算バッチ
-- =====================================================
create table if not exists public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  period_from date not null,
  period_to date not null,
  status text not null check (status in ('draft', 'approved', 'paid')),
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid null references public.staff_profiles(id),
  approved_at timestamptz null,
  paid_at timestamptz null,
  unique (period_from, period_to)
);

comment on table public.settlement_batches is '精算バッチ（月次）';

-- =====================================================
-- 26. 精算明細
-- =====================================================
create table if not exists public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.settlement_batches(id) on delete cascade,
  cast_id uuid not null references public.staff_profiles(id),
  amount_jpy int not null,
  breakdown jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, cast_id)
);

comment on table public.settlement_items is '精算明細（キャスト別）';

-- =====================================================
-- 27. Webhook冪等
-- =====================================================
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('line', 'stripe')),
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  success boolean not null default false,
  error_message text null,
  unique (provider, event_id)
);

comment on table public.webhook_events is 'Webhook冪等管理（LINE/Stripe）';

-- =====================================================
-- 28. 監査ログ（改ざん不可）
-- =====================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_staff_id uuid null references public.staff_profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  success boolean not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_staff_id, created_at desc);
create index if not exists idx_audit_logs_target on public.audit_logs(target_type, target_id);

comment on table public.audit_logs is '監査ログ（update/delete禁止）';

-- =====================================================
-- 29. updated_atトリガー関数
-- =====================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- end_usersのupdated_at自動更新
drop trigger if exists on_end_users_updated on public.end_users;
create trigger on_end_users_updated
  before update on public.end_users
  for each row execute function public.handle_updated_at();

-- subscriptionsのupdated_at自動更新
drop trigger if exists on_subscriptions_updated on public.subscriptions;
create trigger on_subscriptions_updated
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- checkinsのupdated_at自動更新
drop trigger if exists on_checkins_updated on public.checkins;
create trigger on_checkins_updated
  before update on public.checkins
  for each row execute function public.handle_updated_at();

-- memosのupdated_at自動更新
drop trigger if exists on_memos_updated on public.memos;
create trigger on_memos_updated
  before update on public.memos
  for each row execute function public.handle_updated_at();
