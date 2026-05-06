-- メイトごとの担当スーパーバイザー（管轄）。NULL は未割当。
alter table public.staff_profiles
  add column if not exists supervisor_id uuid null references public.staff_profiles (id) on delete set null;

create index if not exists idx_staff_profiles_supervisor_id
  on public.staff_profiles (supervisor_id)
  where supervisor_id is not null;

comment on column public.staff_profiles.supervisor_id is '伴走メイトの担当スーパーバイザー（staff_profiles.id、role=supervisor を想定）';
