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

1. Run `NODE_ENV=production npx tsx scripts/verify-production-env.ts` against production env.
2. Apply migrations: `npm run db:migrate` on the production Supabase project.
3. Deploy with [`vercel.json`](../vercel.json) cron jobs enabled and `CRON_SECRET` set in Vercel.
4. Complete [EXTERNAL_INTEGRATIONS.md](./EXTERNAL_INTEGRATIONS.md) (LINE + Stripe live webhooks).
5. Complete [LAUNCH_OPS.md](./LAUNCH_OPS.md) (admin staff, tax rate, payout rule, cast profiles).
6. Pass [MANUAL_ACCEPTANCE.md](./MANUAL_ACCEPTANCE.md) on production URL.
7. Create at least one active `subscription_share` payout rule in `/admin/payout-rules`.
8. Confirm an active tax rate exists in `tax_rates`.
9. Confirm `APP_BASE_URL`, `TRIAL_PLAN_CODE`, `TRIAL_PERIOD_DAYS`, and Stripe Price IDs match production.

Cron endpoints (Vercel sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set):

- `GET /api/jobs/sla-alert` — every 5 minutes
- `GET /api/jobs/daily-summary` — 13:00 UTC daily (22:00 JST)

## Soft Launch (Day 1)

1. Onboard 1–3 pilot users: LINE → subscribe → assigned cast replies manually.
2. Monitor Sentry, `/admin/webhooks`, and `/admin/audit` for the first 24 hours.
3. Confirm cast staff enabled Web Push (iOS: home-screen PWA first).
4. Points/gifts remain disabled; escalate payout/settlement to phase 2.

## Secret Rotation

Rotate and redeploy for:
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_USER_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
