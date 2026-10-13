-- =====================================================
-- ステップ配信に「契約後（subscribe）」トリガーを追加
-- 3か月の型の振り返り（7・30・60・90日目）を契約者へ自動配信するため。
-- 起点は end_users.subscribed_at、対象は契約中（trial/active/past_due）。
-- =====================================================
alter table public.step_messages
  drop constraint if exists step_messages_trigger_check;
alter table public.step_messages
  add constraint step_messages_trigger_check
  check (trigger in ('follow', 'checkout_abandoned', 'subscribe'));
