-- メイト別LINE公式アカウント対応
-- 複数のLINE公式アカウント（共通Routine + メイト個別）を管理し、
-- 受信ルーティング・送信元解決・本人連携の基盤とする。

-- =====================================================
-- line_official_accounts: LINE公式アカウント（共通/メイト別）
-- =====================================================
create table if not exists public.line_official_accounts (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid null references public.staff_profiles(id) on delete set null,
  is_default boolean not null default false,
  name text not null,
  channel_id text null,
  bot_user_id text null,
  channel_secret_encrypted text null,
  channel_access_token_encrypted text null,
  liff_id text null,
  rich_menu_uncontracted_id text null,
  rich_menu_contracted_id text null,
  friend_add_url text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.line_official_accounts is 'LINE公式アカウント（共通Routine/メイト個別）。token類は暗号化して保存する';
comment on column public.line_official_accounts.cast_id is '紐づくメイト（staff_profiles.id）。NULL=共通/デフォルトアカウント';
comment on column public.line_official_accounts.is_default is '共通(デフォルト)アカウントフラグ。activeなものは1件のみ';
comment on column public.line_official_accounts.bot_user_id is 'webhookの destination（ボット自身のuserId）。照合・検証用';
comment on column public.line_official_accounts.channel_secret_encrypted is 'チャネルシークレット（AES-256-GCM暗号化）';
comment on column public.line_official_accounts.channel_access_token_encrypted is 'チャネルアクセストークン（AES-256-GCM暗号化）';
comment on column public.line_official_accounts.friend_add_url is '友だち追加URL（契約後の案内に使用）';

-- メイトごとのactiveアカウントは1件まで
create unique index if not exists idx_line_official_accounts_cast_active
  on public.line_official_accounts(cast_id)
  where active and cast_id is not null;

-- activeなデフォルトアカウントは1件まで
create unique index if not exists idx_line_official_accounts_default
  on public.line_official_accounts(is_default)
  where is_default and active;

-- bot_user_id は重複させない（設定済みのもののみ）
create unique index if not exists idx_line_official_accounts_bot_user_id
  on public.line_official_accounts(bot_user_id)
  where bot_user_id is not null;

create index if not exists idx_line_official_accounts_cast
  on public.line_official_accounts(cast_id);

drop trigger if exists on_line_official_accounts_updated on public.line_official_accounts;
create trigger on_line_official_accounts_updated
  before update on public.line_official_accounts
  for each row execute function public.handle_updated_at();

alter table public.line_official_accounts enable row level security;

-- SELECT: admin/supervisor（token列はサーバアクションで除去して返す）
drop policy if exists "line_official_accounts_select" on public.line_official_accounts;
create policy "line_official_accounts_select" on public.line_official_accounts
  for select to authenticated
  using (public.is_admin_or_supervisor());

-- INSERT/UPDATE/DELETE: admin のみ
drop policy if exists "line_official_accounts_insert" on public.line_official_accounts;
create policy "line_official_accounts_insert" on public.line_official_accounts
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "line_official_accounts_update" on public.line_official_accounts;
create policy "line_official_accounts_update" on public.line_official_accounts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "line_official_accounts_delete" on public.line_official_accounts;
create policy "line_official_accounts_delete" on public.line_official_accounts
  for delete to authenticated
  using (public.is_admin());

-- =====================================================
-- messages: 送受信に使われたLINE公式アカウント
-- =====================================================
alter table public.messages
  add column if not exists line_account_id uuid null references public.line_official_accounts(id) on delete set null;

comment on column public.messages.line_account_id is '送受信に使われたLINE公式アカウント。NULL=デフォルト(共通)解釈';

create index if not exists idx_messages_line_account
  on public.messages(line_account_id);

-- =====================================================
-- end_users: 会話が現在乗っているLINE公式アカウント
-- =====================================================
alter table public.end_users
  add column if not exists primary_line_account_id uuid null references public.line_official_accounts(id) on delete set null;

comment on column public.end_users.primary_line_account_id is '会話が現在乗っているLINE公式アカウント（表示・誘導用）。NULL=デフォルト(共通)';

create index if not exists idx_end_users_primary_line_account
  on public.end_users(primary_line_account_id);
