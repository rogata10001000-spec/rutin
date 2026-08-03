-- 「1ユーザー = 1メイト = 1ライブ契約」の仕様確定に伴う堅牢化。
--
-- 背景: 契約中ユーザーの二重申込はアプリ層のガード（actions/subscriptions.ts）で
-- 弾いているが、未契約(incomplete)のうちに複数のStripe決済ページを開けば
-- 両方支払えてしまい（Stripeセッションは約24時間有効）、subscriptions には
-- 一意制約が無いため 2つのライブ契約行が黙って並存し得た（二重課金）。
--
-- 対応は多層防御:
--   1) アプリ層: 新しいチェックアウト作成時に前の未決済セッションを失効させる
--   2) Webhook層: 既存ライブ契約と異なる subscription が完了したら自動キャンセル＋運営通知
--   3) DB層（本ファイル）: ライブ状態の契約はユーザーにつき1行しか入らない部分ユニーク索引
--
-- 適用前確認（2026-07-07 実測）: ライブ状態の重複ユーザーは0件のため安全に適用できる。

create unique index if not exists uq_subscriptions_live_per_user
  on public.subscriptions (end_user_id)
  where status in ('trial', 'active', 'past_due', 'paused');

comment on index public.uq_subscriptions_live_per_user is
  '1ユーザーにライブ状態(trial/active/past_due/paused)の契約は1件のみ。二重課金レースの最終防衛線。';

-- 最後に発行した未決済チェックアウトセッションのID。
-- 新しいセッションを作るとき、これを Stripe API で失効(expire)させてから差し替えることで、
-- 「メイトAの決済ページを開いたままメイトBでも申込→両方支払う」レースを入口で塞ぐ。
alter table public.end_users
  add column if not exists stripe_checkout_session_id text;

comment on column public.end_users.stripe_checkout_session_id is
  '最後に発行したStripeチェックアウトセッションID（新規発行時に前のセッションを失効させるために保持）';
