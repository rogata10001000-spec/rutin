-- メイト別・デフォルトの年額対応 + 価格設定の整合性強化
--
-- 目的:
--  1) cast_plan_price_overrides / plan_prices に年額(amount_annual, stripe_price_id_annual)を追加
--  2) upsert の onConflict が機能するよう一意制約を是正（金額は「金額入力→Stripe Price自動作成」で単一の真実に）
--  3) subscriptions に billing_interval を追加（年額/月額の判定を price_id 推定でなく明示列で持つ）

-- =====================================================
-- 1. cast_plan_price_overrides: 年額カラム + 一意制約是正
-- =====================================================
alter table public.cast_plan_price_overrides
  add column if not exists amount_annual int,
  add column if not exists stripe_price_id_annual text;

-- (cast_id, plan_code) を1行に正規化（古い valid_from / created_at を削除）
delete from public.cast_plan_price_overrides a
using public.cast_plan_price_overrides b
where a.id <> b.id
  and a.cast_id = b.cast_id
  and a.plan_code = b.plan_code
  and (
    a.valid_from < b.valid_from
    or (a.valid_from = b.valid_from and a.created_at < b.created_at)
  );

-- 旧: unique (cast_id, plan_code, valid_from) → 新: unique (cast_id, plan_code)
alter table public.cast_plan_price_overrides
  drop constraint if exists cast_plan_price_overrides_cast_id_plan_code_valid_from_key;
create unique index if not exists uq_cast_plan_override_cast_plan
  on public.cast_plan_price_overrides (cast_id, plan_code);

-- 「金額→Stripe Price自動作成」では同額のメイト同士が同じ Price を共有しうるため、
-- price_id の一意制約は不変条件として成立しない。月額 price_id の unique を解除する。
alter table public.cast_plan_price_overrides
  drop constraint if exists cast_plan_price_overrides_stripe_price_id_key;

-- =====================================================
-- 2. plan_prices: 年額カラム + (plan_code) 一意化
-- =====================================================
alter table public.plan_prices
  add column if not exists amount_annual int,
  add column if not exists stripe_price_id_annual text;

-- plan_code を1行に正規化（最新の active/valid_from を残す）
delete from public.plan_prices a
using public.plan_prices b
where a.id <> b.id
  and a.plan_code = b.plan_code
  and (
    (a.active = false and b.active = true)
    or (a.active = b.active and a.valid_from < b.valid_from)
    or (a.active = b.active and a.valid_from = b.valid_from and a.created_at < b.created_at)
  );

create unique index if not exists uq_plan_prices_plan_code
  on public.plan_prices (plan_code);

create unique index if not exists uq_plan_prices_annual_price
  on public.plan_prices (stripe_price_id_annual)
  where stripe_price_id_annual is not null;

-- =====================================================
-- 3. subscriptions: billing_interval（月額/年額）
-- =====================================================
alter table public.subscriptions
  add column if not exists billing_interval text not null default 'month';

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (billing_interval in ('month', 'year'));

comment on column public.subscriptions.billing_interval is '請求間隔（month/year）。Stripe Checkout のメタデータ billing_interval を同期する';
