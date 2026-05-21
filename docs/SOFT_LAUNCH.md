# Soft Launch Runbook

Scope: **Stripe subscription + LINE consultation + admin operations only.** Points and gifts stay disabled.

## Pre-launch (same day)

- [ ] [DEPLOYMENT.md](./DEPLOYMENT.md) steps completed
- [ ] [MANUAL_ACCEPTANCE.md](./MANUAL_ACCEPTANCE.md) signed off
- [ ] Pilot user LINE IDs and assigned casts documented

## Hour 0 — Open

1. Admin confirms cast **accepting new users** toggles.
2. Pilot user completes subscribe flow once (live payment).
3. Cast confirms Inbox → Chat reply reaches LINE.

## Hours 1–24 — Monitor

| Signal | Where |
|--------|--------|
| App errors | Sentry |
| Webhook failures | `/admin/webhooks` |
| Staff actions | `/admin/audit` |
| SLA warnings | `audit_logs` from cron / Inbox |

## Escalation

Follow **Incident Response** in [RUNBOOK.md](./RUNBOOK.md):

1. Assess Sentry + `webhook_events` failures.
2. Fix root cause, redeploy if needed.
3. Replay failed Stripe events from admin UI when safe.

## Staff reminders

- No automatic messages to users (human send only).
- Danger keyword detection is manual (tags + Inbox priority).
- iOS: add to home screen before enabling push.

## Phase 2 triggers

Enable when business-ready: points/gifts, Shadow drafts, settlement batches, additional E2E coverage.
