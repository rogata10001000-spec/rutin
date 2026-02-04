-- Add trial tracking and cast availability flags
alter table if exists public.end_users
  add column if not exists trial_end_at timestamptz null;

alter table if exists public.staff_profiles
  add column if not exists accepting_new_users boolean not null default true;
