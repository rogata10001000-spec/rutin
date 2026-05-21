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

### Verification

- Send a test message from LINE → appears in admin Inbox
- Postback check-in → row in `checkins` table
- New friend → welcome flow (no duplicate errors in `webhook_events`)

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
   - `invoice.paid`
   - `invoice.payment_failed`
6. Copy signing secret → `STRIPE_WEBHOOK_SECRET`
7. Checkout success/cancel URLs must use `APP_BASE_URL` (configured in subscription actions).

### Verification

- Complete one test subscription (real card or Stripe test in live with caution)
- `end_users.status` becomes active/trial
- Contracted rich menu applied via webhook
- Event visible in `/admin/webhooks` with `status = processed`

## Soft Launch Scope

The following are **disabled** at launch (no action required until phase 2):

- Point purchase (`point purchase disabled for MVP` in Stripe webhook)
- Gift pages (`/gift`, `/points` show MVP-out-of-scope message)
