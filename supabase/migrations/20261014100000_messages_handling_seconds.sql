-- =====================================================
-- 返信1件の実作業時間（KPI: 1人で130人に対応できているか）
--
-- 会話を開いてから送信するまでの秒数をクライアントで計測して保存する。
-- 送信本体を止めないよう、アプリ側は insert 後の best-effort update で書く
-- （この列が未適用でも送信は成立する）。
-- =====================================================
alter table public.messages
  add column if not exists handling_seconds integer
    check (handling_seconds is null or (handling_seconds >= 0 and handling_seconds <= 86400));

comment on column public.messages.handling_seconds is
  '送信者が会話を開いてから送信するまでの秒数（クライアント計測・out のみ・1時間超は記録しない）';

-- 直近N日の担当者別集計（KPI画面・日次通知）用
create index if not exists idx_messages_out_staff_created
  on public.messages (sent_by_staff_id, created_at desc)
  where direction = 'out';
