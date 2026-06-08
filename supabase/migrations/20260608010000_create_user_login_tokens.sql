-- =====================================================
-- メールマジックリンク用の単回ログイントークン
-- 目的: LINE 非依存のメールログインで、本人確認済みの
--       短命・単回トークンを安全に発行・検証する。
-- =====================================================

create table if not exists public.user_login_tokens (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  -- トークン本体は保存せず SHA-256 ハッシュのみ保存する
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists user_login_tokens_end_user_idx
  on public.user_login_tokens (end_user_id);

create index if not exists user_login_tokens_expires_idx
  on public.user_login_tokens (expires_at);

-- service_role からのみアクセスする。RLS 有効・ポリシーなし（authenticated/anon は全拒否）。
alter table public.user_login_tokens enable row level security;

comment on table public.user_login_tokens is 'メールマジックリンクの単回ログイントークン（ハッシュ保存・service_role専用）。';
comment on column public.user_login_tokens.token_hash is '生トークンのSHA-256（hex）。生値はDBに保存しない。';
comment on column public.user_login_tokens.used_at is '使用済み日時。NULL以外は再利用不可。';
