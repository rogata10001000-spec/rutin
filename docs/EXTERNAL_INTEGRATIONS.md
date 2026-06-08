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
9. 契約済リッチメニューに「契約・プラン」ボタンを設定する。**推奨は LIFF リンク方式**（下記「LIFF（契約マイページのワンタップ導線）」を参照）。後方互換として postback 方式も併用可。
   - LIFF 方式（推奨）: ボタンを **リンク** タイプにし、URL を `https://liff.line.me/<LIFF_ID>` に設定。ワンタップで本人のマイページが開く。
   - postback 方式（フォールバック）: postback data `action=manage_subscription`。webhook が本人の `line_user_id` から短命トークン付き URL（30分有効）を生成して返信し、`https://<APP_BASE_URL>/account/plan?token=...` へ誘導する。
   - 未契約・解約済みユーザーが押した場合は、自動的に新規契約導線（`/subscribe/cast`）へ案内する。

## LIFF（契約マイページのワンタップ導線）

リッチメニューから全員共通の LIFF URL でワンタップ遷移し、LIFF の IDトークンをサーバーで検証して本人セッションを発行する。

1. LINE Developers Console で、Messaging API チャネルと **同一プロバイダー** の **LINE Login チャネル** を用意する（無ければ作成）。
   - ⚠️ 異なるプロバイダーだと IDトークンの `sub` が保存済み `line_user_id` と不一致になり本人解決できない。
2. その LINE Login チャネルに **LIFF アプリ** を追加する。
   - エンドポイント URL: `https://<APP_BASE_URL>/liff/mypage`
   - サイズ: Full（推奨）
   - scope: `profile`（`openid` を含める。`email` は任意）
3. 発行された **LIFF ID** → `NEXT_PUBLIC_LIFF_ID`
4. LIFF が属する **チャネル ID**（LINE Login チャネルの Channel ID） → `LINE_LIFF_CHANNEL_ID`（IDトークン検証の `client_id`/`aud`）
5. リッチメニュー「契約・プラン」ボタンを **リンク** タイプにし、URL を `https://liff.line.me/<NEXT_PUBLIC_LIFF_ID>` に設定。
6. ローカル / Vercel 双方に `NEXT_PUBLIC_LIFF_ID` と `LINE_LIFF_CHANNEL_ID` を設定する。
   - env 未設定時は `/liff/mypage` が「準備中」を表示するだけで、既存導線（postback・メールログイン）には無影響。

### Verification

- Send a test message from LINE → appears in admin Inbox
- Postback check-in → row in `checkins` table
- New friend → welcome flow (no duplicate errors in `webhook_events`)
- 実機 LINE でリッチメニュー「契約・プラン」（LIFFリンク） → ワンタップで `/account/plan` に本人の契約が表示される
- Postback `action=manage_subscription`（契約者・フォールバック） → 契約管理ページのトークン付き URL が返信される
- 契約管理ページでプラン変更/解約 → Stripe と `subscriptions` の `plan_code` / `cancel_at_period_end` が一致
- `/liff/mypage` を LINE 外（PCブラウザ等）で開く → 「LINEアプリから開いてください」を表示

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
