-- マーケティング分析・売上予測用の状態遷移データ基盤

alter table public.end_users
  add column if not exists trial_started_at timestamptz null,
  add column if not exists subscribed_at timestamptz null,
  add column if not exists canceled_at timestamptz null,
  add column if not exists line_followed_at timestamptz null;

create index if not exists idx_end_users_trial_started_at
  on public.end_users(trial_started_at);
create index if not exists idx_end_users_subscribed_at
  on public.end_users(subscribed_at);
create index if not exists idx_end_users_canceled_at
  on public.end_users(canceled_at);
create index if not exists idx_end_users_line_followed_at
  on public.end_users(line_followed_at);

create table if not exists public.subscription_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  end_user_id uuid not null references public.end_users(id) on delete cascade,
  cast_id uuid null references public.staff_profiles(id),
  event_type text not null check (
    event_type in (
      'line_follow',
      'trial_start',
      'subscribe',
      'plan_change',
      'cancel_scheduled',
      'cancel',
      'resume'
    )
  ),
  plan_code text null references public.plans(plan_code),
  occurred_at timestamptz not null,
  source_ref_type text null,
  source_ref_id text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_lifecycle_events_type_at
  on public.subscription_lifecycle_events(event_type, occurred_at desc);
create index if not exists idx_subscription_lifecycle_events_cast_at
  on public.subscription_lifecycle_events(cast_id, occurred_at desc);
create index if not exists idx_subscription_lifecycle_events_user_at
  on public.subscription_lifecycle_events(end_user_id, occurred_at desc);
create unique index if not exists idx_subscription_lifecycle_events_source_ref
  on public.subscription_lifecycle_events(source_ref_type, source_ref_id)
  where source_ref_type is not null and source_ref_id is not null;

alter table public.subscription_lifecycle_events enable row level security;

drop policy if exists "subscription_lifecycle_events_select" on public.subscription_lifecycle_events;
create policy "subscription_lifecycle_events_select" on public.subscription_lifecycle_events
  for select to authenticated
  using (
    public.is_admin_or_supervisor()
    or cast_id = auth.uid()
  );

drop policy if exists "subscription_lifecycle_events_insert" on public.subscription_lifecycle_events;
create policy "subscription_lifecycle_events_insert" on public.subscription_lifecycle_events
  for insert to authenticated
  with check (public.is_admin_or_supervisor());

comment on table public.subscription_lifecycle_events is '契約・LINE追加・解約などのライフサイクルイベント（マーケティング分析の正本）';
comment on column public.end_users.line_followed_at is 'LINE友だち追加日時。既存データは監査ログまたは作成日時から近似バックフィル';
comment on column public.end_users.trial_started_at is 'トライアル開始日時。既存データはサブスク作成日時から近似バックフィル';
comment on column public.end_users.subscribed_at is '初回有料契約確定日時。既存データは監査ログまたはサブスク作成日時から近似バックフィル';
comment on column public.end_users.canceled_at is '解約完了日時。既存データは監査ログまたは更新日時から近似バックフィル';

-- 既存データの近似バックフィル
with first_follow as (
  select target_id::uuid as end_user_id, min(created_at) as followed_at
  from public.audit_logs
  where action = 'LINE_FOLLOW'
    and target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by target_id
)
update public.end_users eu
set line_followed_at = coalesce(eu.line_followed_at, ff.followed_at, eu.created_at)
from first_follow ff
where eu.id = ff.end_user_id
  and eu.line_followed_at is null;

update public.end_users
set line_followed_at = coalesce(line_followed_at, created_at)
where line_followed_at is null;

with first_subscription as (
  select end_user_id, min(created_at) as first_subscribed_at
  from public.subscriptions
  group by end_user_id
)
update public.end_users eu
set trial_started_at = coalesce(eu.trial_started_at, fs.first_subscribed_at)
from first_subscription fs
where eu.id = fs.end_user_id
  and eu.trial_started_at is null
  and eu.status = 'trial';

with converted as (
  select target_id::uuid as subscription_id, min(created_at) as converted_at
  from public.audit_logs
  where action = 'SUBSCRIPTION_SYNC'
    and metadata->>'trial_converted' = 'true'
    and target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by target_id
),
subscribed as (
  select s.end_user_id, min(coalesce(c.converted_at, s.created_at)) as subscribed_at
  from public.subscriptions s
  left join converted c on c.subscription_id = s.id
  where s.status in ('active', 'past_due', 'paused')
  group by s.end_user_id
)
update public.end_users eu
set subscribed_at = coalesce(eu.subscribed_at, s.subscribed_at)
from subscribed s
where eu.id = s.end_user_id
  and eu.subscribed_at is null;

with canceled as (
  select s.end_user_id, min(coalesce(a.created_at, s.updated_at)) as canceled_at
  from public.subscriptions s
  left join public.audit_logs a
    on a.target_id = s.id::text
   and a.action = 'SUBSCRIPTION_SYNC'
   and a.metadata->>'new_status' = 'canceled'
  where s.status = 'canceled'
  group by s.end_user_id
)
update public.end_users eu
set canceled_at = coalesce(eu.canceled_at, c.canceled_at, eu.updated_at)
from canceled c
where eu.id = c.end_user_id
  and eu.canceled_at is null;

insert into public.subscription_lifecycle_events (
  end_user_id,
  cast_id,
  event_type,
  plan_code,
  occurred_at,
  source_ref_type,
  source_ref_id,
  metadata
)
select
  eu.id,
  eu.assigned_cast_id,
  'line_follow',
  eu.plan_code,
  eu.line_followed_at,
  'backfill:end_users:line_follow',
  eu.id::text,
  jsonb_build_object('backfilled', true, 'source', 'line_followed_at')
from public.end_users eu
where eu.line_followed_at is not null
on conflict do nothing;

insert into public.subscription_lifecycle_events (
  end_user_id,
  cast_id,
  event_type,
  plan_code,
  occurred_at,
  source_ref_type,
  source_ref_id,
  metadata
)
select
  eu.id,
  eu.assigned_cast_id,
  'trial_start',
  eu.plan_code,
  eu.trial_started_at,
  'backfill:end_users:trial_start',
  eu.id::text,
  jsonb_build_object('backfilled', true, 'source', 'trial_started_at')
from public.end_users eu
where eu.trial_started_at is not null
on conflict do nothing;

insert into public.subscription_lifecycle_events (
  end_user_id,
  cast_id,
  event_type,
  plan_code,
  occurred_at,
  source_ref_type,
  source_ref_id,
  metadata
)
select
  eu.id,
  eu.assigned_cast_id,
  'subscribe',
  eu.plan_code,
  eu.subscribed_at,
  'backfill:end_users:subscribe',
  eu.id::text,
  jsonb_build_object('backfilled', true, 'source', 'subscribed_at')
from public.end_users eu
where eu.subscribed_at is not null
on conflict do nothing;

insert into public.subscription_lifecycle_events (
  end_user_id,
  cast_id,
  event_type,
  plan_code,
  occurred_at,
  source_ref_type,
  source_ref_id,
  metadata
)
select
  eu.id,
  eu.assigned_cast_id,
  'cancel',
  eu.plan_code,
  eu.canceled_at,
  'backfill:end_users:cancel',
  eu.id::text,
  jsonb_build_object('backfilled', true, 'source', 'canceled_at')
from public.end_users eu
where eu.canceled_at is not null
on conflict do nothing;
