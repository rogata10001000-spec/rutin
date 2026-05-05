-- Staff Push Subscriptions
-- キャスト/スタッフ向けWeb Push購読情報

create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  platform text null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_push_subscriptions_staff
  on public.staff_push_subscriptions(staff_id, enabled);

comment on table public.staff_push_subscriptions is 'スタッフ/キャスト端末のWeb Push購読情報';
comment on column public.staff_push_subscriptions.endpoint is 'PushSubscription endpoint';
comment on column public.staff_push_subscriptions.p256dh is 'PushSubscription keys.p256dh';
comment on column public.staff_push_subscriptions.auth is 'PushSubscription keys.auth';

drop trigger if exists on_staff_push_subscriptions_updated on public.staff_push_subscriptions;
create trigger on_staff_push_subscriptions_updated
  before update on public.staff_push_subscriptions
  for each row execute function public.handle_updated_at();

alter table public.staff_push_subscriptions enable row level security;

create policy "staff_push_subscriptions_select" on public.staff_push_subscriptions
  for select to authenticated
  using (staff_id = auth.uid() or public.is_admin_or_supervisor());

create policy "staff_push_subscriptions_insert" on public.staff_push_subscriptions
  for insert to authenticated
  with check (staff_id = auth.uid());

create policy "staff_push_subscriptions_update" on public.staff_push_subscriptions
  for update to authenticated
  using (staff_id = auth.uid() or public.is_admin())
  with check (staff_id = auth.uid() or public.is_admin());

create policy "staff_push_subscriptions_delete" on public.staff_push_subscriptions
  for delete to authenticated
  using (staff_id = auth.uid());
