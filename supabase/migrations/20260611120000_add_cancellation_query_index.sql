-- 解約予定一覧クエリの高速化
create index if not exists idx_subscriptions_cancel_pending
  on public.subscriptions (current_period_end)
  where cancel_at_period_end = true and status not in ('canceled', 'incomplete');
