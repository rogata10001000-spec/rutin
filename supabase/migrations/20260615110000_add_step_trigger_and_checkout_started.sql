-- ステップ配信のトリガー種別を追加（follow=友だち追加 / checkout_abandoned=カゴ落ち）
alter table public.step_messages
  add column if not exists trigger text not null default 'follow'
  check (trigger in ('follow', 'checkout_abandoned'));

-- カゴ落ち検知用: 決済セッションを開始した時刻
alter table public.end_users
  add column if not exists checkout_started_at timestamptz null;

create index if not exists idx_end_users_checkout_started_at
  on public.end_users (checkout_started_at);
