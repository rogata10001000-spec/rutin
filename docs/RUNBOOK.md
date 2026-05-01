# Operations Runbook

## Health and Monitoring

- Health check endpoint: `GET /api/health`
- Error tracking: Sentry (`NEXT_PUBLIC_SENTRY_DSN`)
- Structured logs: JSON via `lib/logger.ts`

## Incident Response

1. Confirm blast radius from Sentry issue count and affected endpoints.
2. Check webhook failures in `webhook_events` table.
3. For Stripe failures, replay failed events after fixing the root cause and confirm `status = 'processed'`.
4. Apply mitigation (disable feature flag or route traffic reduction).
5. Deploy fix and monitor error rate for 30 minutes.

## Launch Checklist

Before accepting paid subscriptions:

1. Create at least one active `subscription_share` payout rule in `/admin/payout-rules`.
2. Confirm an active tax rate exists in `tax_rates`.
3. Confirm `APP_BASE_URL`, `TRIAL_PLAN_CODE`, `TRIAL_PERIOD_DAYS`, and Stripe Price IDs match production.
4. Confirm `CRON_SECRET` is configured in the scheduler as `Authorization: Bearer <secret>`.

## Secret Rotation

Rotate and redeploy for:
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_USER_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
