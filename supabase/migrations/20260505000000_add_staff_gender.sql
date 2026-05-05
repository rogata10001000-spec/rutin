-- Add gender column to staff_profiles for cast filtering on subscribe page
alter table if exists public.staff_profiles
  add column if not exists gender text null
    check (gender is null or gender in ('female', 'male', 'other'));

create index if not exists idx_staff_profiles_gender on public.staff_profiles(gender)
  where gender is not null;

comment on column public.staff_profiles.gender is 'キャストの性別（female/male/other、NULLは未設定）';
