# Deployment Guide

## Prerequisites

- Node.js 20+
- Supabase project (production) linked via `supabase link`
- Vercel project connected to this repository
- Required environment variables from [`.env.example`](../.env.example)

## Environment Validation

Before deploying to production:

```bash
# Load production env (Vercel CLI or exported vars)
export $(grep -v '^#' .env.production.local | xargs)  # example only
NODE_ENV=production npx tsx scripts/verify-production-env.ts
```

Generate Web Push VAPID keys (use separate keys per environment):

```bash
npx web-push generate-vapid-keys
```

Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_CONTACT` in Vercel.

## Deploy Steps

1. Install dependencies:
   - `npm ci`
2. Apply database migrations to the **production** Supabase project:
   - `supabase link --project-ref <prod-ref>` (if not linked)
   - `npm run db:migrate`
3. Run quality checks:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
4. Deploy to Vercel:
   - Push to `main`, or `vercel --prod`
5. Set all production environment variables in the Vercel dashboard (see [RUNBOOK.md](./RUNBOOK.md) Launch Checklist).
6. Confirm cron jobs are active ([`vercel.json`](../vercel.json)):
   - `/api/jobs/sla-alert` — every 5 minutes (UTC)
   - `/api/jobs/daily-summary` — daily at 13:00 UTC (22:00 JST)
   - Requires `CRON_SECRET` in Vercel env; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
7. Verify health:
   - `GET https://<APP_BASE_URL>/api/health`

## Vercel Environment Variables (Soft Launch)

| Variable | Required | Notes |
|----------|----------|-------|
| `APP_BASE_URL` | Yes | Production URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_*` | Yes | Production Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only |
| `LINE_*` | Yes | Production LINE channel |
| `STRIPE_*` | Yes | `sk_live_` and live Price IDs |
| `CRON_SECRET` | Yes | 16+ chars |
| `LINE_USER_TOKEN_SECRET` | Yes | 32+ chars |
| `RICH_MENU_ID_*` | Yes | LINE Developers console |
| `WEB_PUSH_VAPID_*` | Recommended | Skip push if omitted |
| `AI_PROVIDER_KEY` | Optional | AI draft feature |
| `NEXT_PUBLIC_SENTRY_DSN` | Recommended | Error tracking |

## Rollback

1. Roll back application deploy to previous version in Vercel.
2. If migration rollback is needed, apply a compensating migration in `supabase/migrations/`.
3. Verify health endpoint: `GET /api/health`

## Related Docs

- [RUNBOOK.md](./RUNBOOK.md) — operations and launch checklist
- [EXTERNAL_INTEGRATIONS.md](./EXTERNAL_INTEGRATIONS.md) — LINE / Stripe setup
- [LAUNCH_OPS.md](./LAUNCH_OPS.md) — staff and master data bootstrap
- [MANUAL_ACCEPTANCE.md](./MANUAL_ACCEPTANCE.md) — pre-launch test checklist
