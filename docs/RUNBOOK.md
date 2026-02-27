# Operations Runbook

## Health and Monitoring

- Health check endpoint: `GET /api/health`
- Error tracking: Sentry (`NEXT_PUBLIC_SENTRY_DSN`)
- Structured logs: JSON via `lib/logger.ts`

## Incident Response

1. Confirm blast radius from Sentry issue count and affected endpoints.
2. Check webhook failures in `webhook_events` table.
3. If gift send failures occur, inspect `send_gift_atomic` DB function logs/errors.
4. Apply mitigation (disable feature flag or route traffic reduction).
5. Deploy fix and monitor error rate for 30 minutes.

## Secret Rotation

Rotate and redeploy for:
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_USER_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
