-- 公式LINE（共通アカウント）の友だち追加の流入元分析。
-- LINEのfollow webhookは流入元を持たないため、LIFF入口で src を捕捉し
-- line_user_id に紐付けて保留 → follow時に end_users へ first-touch で確定させる。

-- 確定した流入元（first-touch）。
alter table public.end_users
  add column if not exists acquisition_source text,
  add column if not exists acquisition_recorded_at timestamptz;

-- follow より前にLIFFで捕捉した流入元の保留置き場（line_user_id単位・first-touch）。
create table if not exists public.line_acquisition_attributions (
  line_user_id text primary key,
  source text not null,
  landing_url text,
  referrer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.line_acquisition_attributions is
  'LIFF入口で捕捉した公式LINE流入元の保留（follow時にend_users.acquisition_sourceへ確定）';

alter table public.line_acquisition_attributions enable row level security;

-- 参照は管理者/SVのみ（書き込みは service_role がRLSバイパスで実施）。
drop policy if exists line_acquisition_attributions_select on public.line_acquisition_attributions;
create policy line_acquisition_attributions_select
  on public.line_acquisition_attributions
  for select to authenticated
  using (public.is_admin_or_supervisor());
