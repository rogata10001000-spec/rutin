-- trial_converted 監査ログがある既存ユーザーに、トライアル開始イベントを近似補完する。
-- 初回 migration 適用後の追加バックフィルのため、別 migration として管理する。

with converted_subscriptions as (
  select
    s.id as subscription_id,
    s.end_user_id,
    s.plan_code,
    s.created_at as subscription_created_at,
    eu.assigned_cast_id
  from public.subscriptions s
  join public.end_users eu on eu.id = s.end_user_id
  join public.audit_logs a
    on a.target_id = s.id::text
   and a.action = 'SUBSCRIPTION_SYNC'
   and a.metadata->>'trial_converted' = 'true'
)
update public.end_users eu
set trial_started_at = coalesce(eu.trial_started_at, cs.subscription_created_at)
from converted_subscriptions cs
where eu.id = cs.end_user_id
  and eu.trial_started_at is null;

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
with converted_subscriptions as (
  select
    s.id as subscription_id,
    s.end_user_id,
    s.plan_code,
    s.created_at as subscription_created_at,
    eu.assigned_cast_id
  from public.subscriptions s
  join public.end_users eu on eu.id = s.end_user_id
  join public.audit_logs a
    on a.target_id = s.id::text
   and a.action = 'SUBSCRIPTION_SYNC'
   and a.metadata->>'trial_converted' = 'true'
)
select
  cs.end_user_id,
  cs.assigned_cast_id,
  'trial_start',
  cs.plan_code,
  cs.subscription_created_at,
  'backfill:trial_converted:trial_start',
  cs.subscription_id::text,
  jsonb_build_object('backfilled', true, 'source', 'trial_converted_audit')
from converted_subscriptions cs
on conflict do nothing;
