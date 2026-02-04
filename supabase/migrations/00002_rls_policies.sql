-- Rutin MVP RLS Policies
-- 要件定義書 16.2 に基づく権限制御

-- =====================================================
-- ヘルパー関数
-- =====================================================

-- 現在のスタッフロールを取得
create or replace function public.get_current_staff_role()
returns text as $$
  select role from public.staff_profiles where id = auth.uid();
$$ language sql security definer stable;

-- 管理者かどうか（Admin/Supervisor）
create or replace function public.is_admin_or_supervisor()
returns boolean as $$
  select public.get_current_staff_role() in ('admin', 'supervisor');
$$ language sql security definer stable;

-- Adminかどうか
create or replace function public.is_admin()
returns boolean as $$
  select public.get_current_staff_role() = 'admin';
$$ language sql security definer stable;

-- 担当ユーザーかどうか（Cast用）
create or replace function public.is_assigned_to_user(user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.end_users 
    where id = user_id and assigned_cast_id = auth.uid()
  );
$$ language sql security definer stable;

-- Shadow期間中かどうか
create or replace function public.is_shadow_for_user(user_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.cast_assignments
    where end_user_id = user_id
      and to_cast_id = auth.uid()
      and shadow_until is not null
      and shadow_until > now()
  );
$$ language sql security definer stable;

-- =====================================================
-- staff_profiles
-- =====================================================
alter table public.staff_profiles enable row level security;

-- SELECT: 自分 + Admin/Supervisor は全員閲覧可
create policy "staff_profiles_select" on public.staff_profiles
  for select to authenticated
  using (
    id = auth.uid() or public.is_admin_or_supervisor()
  );

-- UPDATE: 自分（表示名のみ）+ Admin
create policy "staff_profiles_update" on public.staff_profiles
  for update to authenticated
  using (
    id = auth.uid() or public.is_admin()
  );

-- INSERT: Adminのみ
create policy "staff_profiles_insert" on public.staff_profiles
  for insert to authenticated
  with check (public.is_admin());

-- DELETE: Adminのみ（論理削除推奨）
create policy "staff_profiles_delete" on public.staff_profiles
  for delete to authenticated
  using (public.is_admin());

-- =====================================================
-- end_users
-- =====================================================
alter table public.end_users enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ（incompleteを除外）
create policy "end_users_select" on public.end_users
  for select to authenticated
  using (
    case public.get_current_staff_role()
      when 'admin' then true
      when 'supervisor' then true
      when 'cast' then 
        status != 'incomplete' 
        and (assigned_cast_id = auth.uid() or public.is_shadow_for_user(id))
      else false
    end
  );

-- UPDATE: Admin/Supervisor
create policy "end_users_update" on public.end_users
  for update to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT: Admin/Supervisor（webhook経由）
create policy "end_users_insert" on public.end_users
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- =====================================================
-- cast_assignments（履歴改ざん防止）
-- =====================================================
alter table public.cast_assignments enable row level security;

-- SELECT: Admin/Supervisorのみ
create policy "cast_assignments_select" on public.cast_assignments
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT: Admin/Supervisor
create policy "cast_assignments_insert" on public.cast_assignments
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- UPDATE/DELETE: 禁止（改ざん防止）
-- ポリシーを作成しない = 誰も実行できない

-- =====================================================
-- messages
-- =====================================================
alter table public.messages enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "messages_select" on public.messages
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
    or public.is_shadow_for_user(end_user_id)
  );

-- INSERT(out): Admin/Supervisor全件、Cast担当のみ（Shadowは不可）
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id))
    and not public.is_shadow_for_user(end_user_id)
  );

-- UPDATE/DELETE: 禁止（改ざん防止）

-- =====================================================
-- checkins
-- =====================================================
alter table public.checkins enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "checkins_select" on public.checkins
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- INSERT/UPDATE: Admin/Supervisor（システム経由）
create policy "checkins_insert" on public.checkins
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

create policy "checkins_update" on public.checkins
  for update to authenticated
  using (public.is_admin_or_supervisor());

-- =====================================================
-- memos
-- =====================================================
alter table public.memos enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "memos_select" on public.memos
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- INSERT: Admin/Supervisor全件、Cast担当のみ
create policy "memos_insert" on public.memos
  for insert to authenticated
  with check (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- UPDATE: Admin/Supervisor全件、Cast担当のみ
create policy "memos_update" on public.memos
  for update to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- DELETE: 禁止（履歴性重視）

-- =====================================================
-- memo_revisions（改ざん防止）
-- =====================================================
alter table public.memo_revisions enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "memo_revisions_select" on public.memo_revisions
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or exists (
      select 1 from public.memos m 
      where m.id = memo_id and public.is_assigned_to_user(m.end_user_id)
    )
  );

-- INSERT: メモと同じ条件
create policy "memo_revisions_insert" on public.memo_revisions
  for insert to authenticated
  with check (
    public.is_admin_or_supervisor()
    or exists (
      select 1 from public.memos m 
      where m.id = memo_id and public.is_assigned_to_user(m.end_user_id)
    )
  );

-- UPDATE/DELETE: 禁止

-- =====================================================
-- shadow_drafts
-- =====================================================
alter table public.shadow_drafts enable row level security;

-- SELECT: Admin/Supervisor全件、自分が作成したもの
create policy "shadow_drafts_select" on public.shadow_drafts
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or created_by = auth.uid()
  );

-- INSERT: Shadow期間中のCastのみ
create policy "shadow_drafts_insert" on public.shadow_drafts
  for insert to authenticated
  with check (
    public.is_shadow_for_user(end_user_id)
    and created_by = auth.uid()
  );

-- UPDATE/DELETE: 禁止

-- =====================================================
-- ai_draft_requests
-- =====================================================
alter table public.ai_draft_requests enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "ai_draft_requests_select" on public.ai_draft_requests
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- INSERT: Admin/Supervisor/Cast担当
create policy "ai_draft_requests_insert" on public.ai_draft_requests
  for insert to authenticated
  with check (
    (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id))
    and requested_by = auth.uid()
  );

-- UPDATE/DELETE: 禁止

-- =====================================================
-- ai_drafts
-- =====================================================
alter table public.ai_drafts enable row level security;

-- SELECT: ai_draft_requestsと同じ条件
create policy "ai_drafts_select" on public.ai_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_draft_requests r
      where r.id = request_id
        and (public.is_admin_or_supervisor() or public.is_assigned_to_user(r.end_user_id))
    )
  );

-- INSERT: システム経由（Admin/Supervisor権限で実行）
create policy "ai_drafts_insert" on public.ai_drafts
  for insert to authenticated
  with check (public.is_admin_or_supervisor() or true);  -- Server Action経由

-- =====================================================
-- subscriptions
-- =====================================================
alter table public.subscriptions enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "subscriptions_select" on public.subscriptions
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- INSERT/UPDATE: Adminのみ（Stripe webhook経由）
create policy "subscriptions_insert" on public.subscriptions
  for insert to authenticated
  with check (public.is_admin());

create policy "subscriptions_update" on public.subscriptions
  for update to authenticated
  using (public.is_admin());

-- =====================================================
-- plan_prices / cast_plan_price_overrides
-- =====================================================
alter table public.plan_prices enable row level security;
alter table public.cast_plan_price_overrides enable row level security;

-- SELECT: Admin/Supervisor
create policy "plan_prices_select" on public.plan_prices
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy "cast_plan_price_overrides_select" on public.cast_plan_price_overrides
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/UPDATE: Adminのみ
create policy "plan_prices_insert" on public.plan_prices
  for insert to authenticated
  with check (public.is_admin());

create policy "plan_prices_update" on public.plan_prices
  for update to authenticated
  using (public.is_admin());

create policy "cast_plan_price_overrides_insert" on public.cast_plan_price_overrides
  for insert to authenticated
  with check (public.is_admin());

create policy "cast_plan_price_overrides_update" on public.cast_plan_price_overrides
  for update to authenticated
  using (public.is_admin());

-- =====================================================
-- point_products / gift_catalog
-- =====================================================
alter table public.point_products enable row level security;
alter table public.gift_catalog enable row level security;

-- SELECT: 全員（ユーザー向けページで使用）
create policy "point_products_select" on public.point_products
  for select to authenticated
  using (true);

create policy "gift_catalog_select" on public.gift_catalog
  for select to authenticated
  using (true);

-- INSERT/UPDATE: Adminのみ
create policy "point_products_insert" on public.point_products
  for insert to authenticated
  with check (public.is_admin());

create policy "point_products_update" on public.point_products
  for update to authenticated
  using (public.is_admin());

create policy "gift_catalog_insert" on public.gift_catalog
  for insert to authenticated
  with check (public.is_admin());

create policy "gift_catalog_update" on public.gift_catalog
  for update to authenticated
  using (public.is_admin());

-- =====================================================
-- user_point_ledger
-- =====================================================
alter table public.user_point_ledger enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "user_point_ledger_select" on public.user_point_ledger
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- INSERT: Admin/Supervisor（システム経由）
create policy "user_point_ledger_insert" on public.user_point_ledger
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- =====================================================
-- gift_sends
-- =====================================================
alter table public.gift_sends enable row level security;

-- SELECT: Admin/Supervisor全件、Cast自分宛のみ
create policy "gift_sends_select" on public.gift_sends
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or cast_id = auth.uid()
  );

-- INSERT: Admin/Supervisor（システム経由）
create policy "gift_sends_insert" on public.gift_sends
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- =====================================================
-- revenue_events
-- =====================================================
alter table public.revenue_events enable row level security;

-- SELECT: Admin/Supervisor全件、Cast自分のcast_idのみ
create policy "revenue_events_select" on public.revenue_events
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or cast_id = auth.uid()
  );

-- INSERT: Admin/Supervisor
create policy "revenue_events_insert" on public.revenue_events
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- =====================================================
-- payout_rules
-- =====================================================
alter table public.payout_rules enable row level security;

-- SELECT: Admin/Supervisor
create policy "payout_rules_select" on public.payout_rules
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/UPDATE: Adminのみ
create policy "payout_rules_insert" on public.payout_rules
  for insert to authenticated
  with check (public.is_admin());

create policy "payout_rules_update" on public.payout_rules
  for update to authenticated
  using (public.is_admin());

-- =====================================================
-- payout_calculations
-- =====================================================
alter table public.payout_calculations enable row level security;

-- SELECT: Admin/Supervisor全件、Cast自分のcast_idのみ
create policy "payout_calculations_select" on public.payout_calculations
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or cast_id = auth.uid()
  );

-- INSERT: Admin/Supervisor
create policy "payout_calculations_insert" on public.payout_calculations
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

-- =====================================================
-- settlement_batches / settlement_items
-- =====================================================
alter table public.settlement_batches enable row level security;
alter table public.settlement_items enable row level security;

-- SELECT: Admin/Supervisor
create policy "settlement_batches_select" on public.settlement_batches
  for select to authenticated
  using (public.is_admin_or_supervisor());

create policy "settlement_items_select" on public.settlement_items
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/UPDATE: Adminのみ
create policy "settlement_batches_insert" on public.settlement_batches
  for insert to authenticated
  with check (public.is_admin());

create policy "settlement_batches_update" on public.settlement_batches
  for update to authenticated
  using (public.is_admin());

create policy "settlement_items_insert" on public.settlement_items
  for insert to authenticated
  with check (public.is_admin());

-- =====================================================
-- webhook_events
-- =====================================================
alter table public.webhook_events enable row level security;

-- SELECT: Admin/Supervisor
create policy "webhook_events_select" on public.webhook_events
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT: システム経由（service_role）
-- サービスロールはRLSをバイパスするため、ポリシー不要

-- UPDATE: processed_atのみ（システム経由）
create policy "webhook_events_update" on public.webhook_events
  for update to authenticated
  using (public.is_admin_or_supervisor());

-- =====================================================
-- audit_logs（改ざん不可）
-- =====================================================
alter table public.audit_logs enable row level security;

-- SELECT: Admin/Supervisor
create policy "audit_logs_select" on public.audit_logs
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT: 全スタッフ（ただしServer Action経由）
create policy "audit_logs_insert" on public.audit_logs
  for insert to authenticated
  with check (true);

-- UPDATE/DELETE: 禁止（ポリシーなし = 誰も実行不可）

-- =====================================================
-- birthday_congrats
-- =====================================================
alter table public.birthday_congrats enable row level security;

-- SELECT: Admin/Supervisor全件、Cast担当のみ
create policy "birthday_congrats_select" on public.birthday_congrats
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or exists (
      select 1 from public.end_users e 
      where e.id = end_user_id and public.is_assigned_to_user(e.id)
    )
  );

-- INSERT: Admin/Supervisor/Cast担当
create policy "birthday_congrats_insert" on public.birthday_congrats
  for insert to authenticated
  with check (
    public.is_admin_or_supervisor()
    or public.is_assigned_to_user(end_user_id)
  );

-- =====================================================
-- risk_flags
-- =====================================================
alter table public.risk_flags enable row level security;

-- SELECT: Admin/Supervisor
create policy "risk_flags_select" on public.risk_flags
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/UPDATE: Admin/Supervisor
create policy "risk_flags_insert" on public.risk_flags
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

create policy "risk_flags_update" on public.risk_flags
  for update to authenticated
  using (public.is_admin_or_supervisor());

-- =====================================================
-- plans / tax_rates（マスタデータ、全員閲覧可）
-- =====================================================
alter table public.plans enable row level security;
alter table public.tax_rates enable row level security;

create policy "plans_select" on public.plans
  for select to authenticated
  using (true);

create policy "tax_rates_select" on public.tax_rates
  for select to authenticated
  using (true);

-- INSERT/UPDATE: Adminのみ
create policy "plans_insert" on public.plans
  for insert to authenticated
  with check (public.is_admin());

create policy "plans_update" on public.plans
  for update to authenticated
  using (public.is_admin());

create policy "tax_rates_insert" on public.tax_rates
  for insert to authenticated
  with check (public.is_admin());

create policy "tax_rates_update" on public.tax_rates
  for update to authenticated
  using (public.is_admin());
