-- 月次精算の自動作成（月末締め）に対応するため、
-- settlement_batches.created_by を NULL 許容にする。
-- 自動作成（システム実行）のバッチは created_by = null とする。

alter table public.settlement_batches
  alter column created_by drop not null;

comment on column public.settlement_batches.created_by is '作成者staff_id（月次自動作成の場合はnull＝システム）';
