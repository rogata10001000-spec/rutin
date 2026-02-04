-- 精算関連テーブルに不足カラムを追加

-- 1. settlement_batches に total_amount を追加
alter table public.settlement_batches
add column if not exists total_amount_jpy int not null default 0;

comment on column public.settlement_batches.total_amount_jpy is '精算バッチの合計金額（円）';

-- 2. payout_calculations に settlement_batch_id を追加
alter table public.payout_calculations
add column if not exists settlement_batch_id uuid null references public.settlement_batches(id);

create index if not exists idx_payout_calculations_batch 
on public.payout_calculations(settlement_batch_id);

comment on column public.payout_calculations.settlement_batch_id is '紐付け済み精算バッチID';
