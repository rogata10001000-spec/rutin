-- Restrict cast access to incomplete users
alter table if exists public.end_users enable row level security;

drop policy if exists "cast_cannot_view_incomplete_users" on public.end_users;

create policy "cast_cannot_view_incomplete_users"
on public.end_users
for select
to authenticated
using (
  case
    when (select role from public.staff_profiles where id = auth.uid()) = 'cast'
    then status != 'incomplete' and assigned_cast_id = auth.uid()
    else true
  end
);
