-- 悪質ユーザー（拡散されたメイトLINEを荒らす等）を手動でブロックするためのフラグ。
-- ブロック中の line_user_id は Webhook 冒頭で遮断し、保存・通知・案内を一切行わない。
alter table public.end_users
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz;
