-- 集計ロールアップ（E3）とコホート分析（F）の基盤
-- 目的: 1万人規模でも analytics/funnel を全行スキャンせず高速に表示する

-- 日次メトリクス（毎日のCronで upsert。日付ごとに1行）
create table if not exists public.daily_metrics (
  metric_date date primary key,
  line_follow int not null default 0,
  trial_start int not null default 0,
  subscribe int not null default 0,
  plan_change int not null default 0,
  cancel_scheduled int not null default 0,
  cancel int not null default 0,
  resume int not null default 0,
  revenue_incl_tax_jpy bigint not null default 0,
  active_users int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists idx_daily_metrics_date on public.daily_metrics (metric_date desc);

alter table public.daily_metrics enable row level security;
drop policy if exists daily_metrics_staff_read on public.daily_metrics;
create policy daily_metrics_staff_read on public.daily_metrics
  for select using (public.is_admin_or_supervisor());

-- コホート別の累計売上（契約開始月＝trial_started_at優先、無ければsubscribed_at）をDB側で集計
create or replace function public.get_cohort_revenue()
returns table (cohort_month text, total_incl_tax bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    to_char(date_trunc('month', coalesce(eu.trial_started_at, eu.subscribed_at)), 'YYYY-MM') as cohort_month,
    sum(re.amount_incl_tax_jpy)::bigint as total_incl_tax
  from public.end_users eu
  join public.revenue_events re on re.end_user_id = eu.id
  where coalesce(eu.trial_started_at, eu.subscribed_at) is not null
  group by 1;
$$;
