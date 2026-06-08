# External Integrations (Production)

Replace `<APP_BASE_URL>` with your production domain (same value as `APP_BASE_URL` env).

## LINE Messaging API

1. Open [LINE Developers Console](https://developers.line.biz/) → your **production** Messaging API channel.
2. Set **Webhook URL**: `https://<APP_BASE_URL>/api/webhooks/line`
3. Enable **Use webhook** and disable auto-reply if it conflicts with your flow.
4. Copy **Channel secret** → `LINE_CHANNEL_SECRET`
5. Issue **Channel access token** → `LINE_CHANNEL_ACCESS_TOKEN`
6. Create two rich menus (未契約 / 契約済) with postback actions for check-in (◯/△/×) per requirements.
7. Copy menu IDs → `RICH_MENU_ID_UNCONTRACTED`, `RICH_MENU_ID_CONTRACTED`
8. **LIFF / Web**: ensure subscribe URLs in rich menu point to `https://<APP_BASE_URL>/subscribe/...`
9. 契約済リッチメニューに「契約・プラン」ボタンを **postback** で追加する。
   - postback data: `action=manage_subscription`
   - 固定 URI ではなく postback にすること。webhook が本人の `line_user_id` から短命トークン付き URL（30分有効）を生成して返信し、`https://<APP_BASE_URL>/account/plan?token=...` へ誘導する。
   - 未契約・解約済みユーザーが押した場合は、自動的に新規契約導線（`/subscribe/cast`）へ案内する。

### Verification

- Send a test message from LINE → appears in admin Inbox
- Postback check-in → row in `checkins` table
- New friend → welcome flow (no duplicate errors in `webhook_events`)
- Postback `action=manage_subscription`（契約者） → 契約管理ページのトークン付き URL が返信される
- 契約管理ページでプラン変更/解約 → Stripe と `subscriptions` の `plan_code` / `cancel_at_period_end` が一致

## Stripe (Live Mode)

1. Switch Stripe Dashboard to **Live** mode.
2. Create Products / Prices for Light, Standard, Premium (recurring).
3. Set env:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_PRICE_LIGHT`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PREMIUM`
4. **Webhooks** → Add endpoint: `https://<APP_BASE_URL>/api/webhooks/stripe`
5. Subscribe to events (minimum):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`
6. Copy signing secret → `STRIPE_WEBHOOK_SECRET`
7. Checkout success/cancel URLs must use `APP_BASE_URL` (configured in subscription actions).
8. Checkout collects the customer email; the webhook stores it on `end_users.email` (LINE非依存の連絡先)。

### Verification

- Complete one test subscription (real card or Stripe test in live with caution)
- `end_users.status` becomes active/trial
- Contracted rich menu applied via webhook
- Event visible in `/admin/webhooks` with `status = processed`

## Email (Resend) — LINE非依存の連絡・ログイン経路

LINE が利用できない場合でも顧客と連絡が取れ、顧客自身がプラン変更・解約できるようにするためのメール経路。

1. [Resend](https://resend.com/) でアカウントを作成し、送信ドメインを検証（SPF / DKIM を DNS に設定）。
2. API キーを発行 → `RESEND_API_KEY`
3. 送信元アドレスを設定 → `NOTIFICATION_FROM_EMAIL`（例: `Rutin(ルティン) <noreply@musuv.jp>`、検証済みドメイン推奨）
4. 未設定でもアプリは動作する（メール送信はスキップされ、LINE のみで動く）。本番では設定を推奨。

### メールでできること

- **メールログイン**: `/account/login` でメール入力 → マジックリンク（`/account/auth?lt=...`、30分・単回）→ 本人セッション発行 → `/account/plan`。
- **重要通知の二重送信**: 支払い失敗・解約完了・解約予約・トライアル終了予告を、LINE と メールへ best-effort 送信（`lib/notifications.ts`）。

### バックフィル（既存契約者のメール取り込み）

```bash
npm run backfill:email -- --dry-run   # 対象確認
npm run backfill:email                # 実行（Stripe Customer の email を end_users へ）
```

### アカウント統合

同一人物が LINE/メールで別アカウントに分かれた場合、管理画面 `/admin/account-merge`（管理者のみ）で統合できる。統合元の子データは統合先へ移動し、統合元は削除される（不可逆）。

### Verification

- `/account/login` でメール送信 → 受信したリンクからログインできる
- 支払い失敗時に LINE とメールの両方へ通知が届く（`RESEND_API_KEY` 設定時）

## Soft Launch Scope

The following are **disabled** at launch (no action required until phase 2):

- Point purchase (`point purchase disabled for MVP` in Stripe webhook)
- Gift pages (`/gift`, `/points` show MVP-out-of-scope message)
