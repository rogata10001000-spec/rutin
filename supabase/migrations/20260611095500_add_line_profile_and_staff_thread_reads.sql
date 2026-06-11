-- LINEプロフィール同期情報 + スタッフ別スレッド既読管理

-- =====================================================
-- end_users: LINEプロフィール表示情報
-- =====================================================
alter table public.end_users
  add column if not exists line_display_name text null,
  add column if not exists line_picture_url text null,
  add column if not exists line_profile_synced_at timestamptz null;

comment on column public.end_users.line_display_name is 'LINEプロフィールの表示名';
comment on column public.end_users.line_picture_url is 'LINEプロフィール画像URL';
comment on column public.end_users.line_profile_synced_at is 'LINEプロフィール最終同期日時';

create index if not exists idx_end_users_line_profile_synced_at
  on public.end_users(line_profile_synced_at);

-- =====================================================
-- staff_thread_reads: スタッフごとの既読位置
-- =====================================================
create table if not exists public.staff_thread_reads (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, end_user_id)
);

comment on table public.staff_thread_reads is 'スタッフごとのチャットスレッド既読状態';
comment on column public.staff_thread_reads.last_read_at is '当該スタッフが最後に既読にした日時';

create index if not exists idx_staff_thread_reads_staff
  on public.staff_thread_reads(staff_id, last_read_at desc);
create index if not exists idx_staff_thread_reads_end_user
  on public.staff_thread_reads(end_user_id);

drop trigger if exists on_staff_thread_reads_updated on public.staff_thread_reads;
create trigger on_staff_thread_reads_updated
  before update on public.staff_thread_reads
  for each row execute function public.handle_updated_at();

alter table public.staff_thread_reads enable row level security;

drop policy if exists "staff_thread_reads_select" on public.staff_thread_reads;
create policy "staff_thread_reads_select" on public.staff_thread_reads
  for select to authenticated
  using (
    staff_id = auth.uid()
    and (
      public.is_admin_or_supervisor()
      or public.is_assigned_to_user(end_user_id)
      or public.is_shadow_for_user(end_user_id)
    )
  );

drop policy if exists "staff_thread_reads_insert" on public.staff_thread_reads;
create policy "staff_thread_reads_insert" on public.staff_thread_reads
  for insert to authenticated
  with check (
    staff_id = auth.uid()
    and (
      public.is_admin_or_supervisor()
      or public.is_assigned_to_user(end_user_id)
      or public.is_shadow_for_user(end_user_id)
    )
  );

drop policy if exists "staff_thread_reads_update" on public.staff_thread_reads;
create policy "staff_thread_reads_update" on public.staff_thread_reads
  for update to authenticated
  using (
    staff_id = auth.uid()
    and (
      public.is_admin_or_supervisor()
      or public.is_assigned_to_user(end_user_id)
      or public.is_shadow_for_user(end_user_id)
    )
  )
  with check (
    staff_id = auth.uid()
    and (
      public.is_admin_or_supervisor()
      or public.is_assigned_to_user(end_user_id)
      or public.is_shadow_for_user(end_user_id)
    )
  );

drop policy if exists "staff_thread_reads_delete" on public.staff_thread_reads;
create policy "staff_thread_reads_delete" on public.staff_thread_reads
  for delete to authenticated
  using (staff_id = auth.uid());
