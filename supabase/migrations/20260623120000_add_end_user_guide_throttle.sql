-- 未契約ユーザーへ契約案内を最後に送った時刻。
-- 案内の連投（同一ユーザーへ短時間に何度もFlexを返す）を防ぐスロットルに使う。
alter table public.end_users
  add column if not exists last_guide_sent_at timestamptz;
