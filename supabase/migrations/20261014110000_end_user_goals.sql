-- =====================================================
-- 利用者の目標（3か月の型: 卒業させず、達成したら次の目標へ）
-- docs/SOLO_SCALE_REQUIREMENTS.md §5
--
-- 1人につき active は1件（部分ユニーク）。次の目標を立てると旧目標は replaced。
-- 申込完了画面（service_role）とメイト（RLS: 担当 or 管理者）から書く。
-- =====================================================
create table if not exists public.end_user_goals (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  category text not null check (category in ('exercise', 'study', 'life', 'work', 'other')),
  title text not null check (char_length(title) between 1 and 60),
  weekly_target int check (weekly_target is null or weekly_target between 1 and 7),
  started_at date not null,
  review_at date not null,
  status text not null default 'active' check (status in ('active', 'achieved', 'replaced')),
  achieved_at timestamptz,
  created_by_staff_id uuid references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_end_user_goals_active
  on public.end_user_goals (end_user_id) where status = 'active';
create index if not exists idx_end_user_goals_review
  on public.end_user_goals (review_at) where status = 'active';

comment on table public.end_user_goals is '利用者の目標（active は1人1件。達成/次の目標で履歴化）';

drop trigger if exists on_end_user_goals_updated on public.end_user_goals;
create trigger on_end_user_goals_updated
  before update on public.end_user_goals
  for each row execute function public.handle_updated_at();

alter table public.end_user_goals enable row level security;

drop policy if exists "end_user_goals_select" on public.end_user_goals;
create policy "end_user_goals_select" on public.end_user_goals
  for select to authenticated
  using (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id));

drop policy if exists "end_user_goals_insert" on public.end_user_goals;
create policy "end_user_goals_insert" on public.end_user_goals
  for insert to authenticated
  with check (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id));

drop policy if exists "end_user_goals_update" on public.end_user_goals;
create policy "end_user_goals_update" on public.end_user_goals
  for update to authenticated
  using (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id))
  with check (public.is_admin_or_supervisor() or public.is_assigned_to_user(end_user_id));

-- anon には一切開かない（default privileges の残存を剥がす）
revoke all on public.end_user_goals from anon;
