# Manual Acceptance Checklist (Soft Launch)

Run against **production** `APP_BASE_URL` before opening to users. Record date and tester name.

| # | Scenario | Steps | Pass |
|---|----------|-------|------|
| 1 | Staff login | Login with admin account → land on `/inbox` | [ ] |
| 2 | Auth guard | Logged out visit `/inbox` → redirect `/login` | [ ] |
| 3 | LINE inbound | Friend add + send text → user in Inbox (Realtime or refresh) | [ ] |
| 4 | Chat reply | Reply from Chat → message on LINE, `direction=out` in DB | [ ] |
| 5 | Check-in | Rich menu postback ◯/△/× → `checkins` row | [ ] |
| 6 | Subscribe | JWT link from LINE → `/subscribe/cast` → plan → Stripe Checkout → active | [ ] |
| 7 | Rich menu switch | After subscription → contracted menu on LINE | [ ] |
| 8 | Web Push | Enable notifications (PWA on iOS) → inbound message triggers push | [ ] |
| 9 | Webhook admin | `/admin/webhooks` shows recent events; replay works if forced failure | [ ] |
| 10 | RBAC | Cast cannot open non-assigned `/chat/{id}` | [ ] |
| 11 | Health | `GET /api/health` returns OK | [ ] |
| 12 | Cron | Manual `sla-alert` curl with Bearer token returns 200 | [ ] |

## Optional (if AI enabled)

| # | Scenario | Pass |
|---|----------|------|
| 13 | AI draft | AI button returns 3 drafts; 4th attempt same day blocked | [ ] |

## Sign-off

- [ ] All required rows (1–12) passed
- [ ] Sentry receiving events (test error or verified DSN)
- [ ] Staff briefed: iOS PWA for push, no auto-reply to users, points/gifts disabled
