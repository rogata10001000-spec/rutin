-- =====================================================
-- end_users にメール・電話の連絡先カラムを追加
-- 目的: LINE 障害時にも顧客と連絡が取れる独立した経路を確保し、
--       メールによる本人確認ログインの土台を用意する。
-- =====================================================

alter table public.end_users
  add column if not exists email text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone text;

-- メールは大小無視で一意（NULL は対象外）。重複アカウント作成を防ぐ。
create unique index if not exists end_users_email_lower_unique
  on public.end_users (lower(email))
  where email is not null;

comment on column public.end_users.email is 'LINE非依存の連絡・ログイン用メール。lower()で正規化して保存する。';
comment on column public.end_users.email_verified_at is 'メールの本人確認が完了した日時。マジックリンク検証成功時に記録。';
comment on column public.end_users.phone is '将来の連絡経路（任意）。E.164等で正規化して保存する想定。';
