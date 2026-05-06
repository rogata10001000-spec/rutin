-- Add birth_date and user-facing public profile to staff_profiles
alter table if exists public.staff_profiles
  add column if not exists birth_date date null,
  add column if not exists public_profile text null;

comment on column public.staff_profiles.birth_date is '伴走メイトの生年月日（年齢計算用、公開画面では年齢のみ表示）';
comment on column public.staff_profiles.public_profile is 'ユーザー向け公開プロフィール文（style_summaryはAI内部用と分離）';
