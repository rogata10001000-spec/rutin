# Production Launch Index (Soft Launch)

Execute in order:

1. **Code & DB** — `npm run lint && npm run typecheck && npm run test && npm run build`, then `npm run db:migrate`
2. **Deploy** — [DEPLOYMENT.md](./DEPLOYMENT.md)
3. **Env** — `npm run verify:env` with production variables loaded
4. **Cron** — [`vercel.json`](../vercel.json) + `CRON_SECRET` on Vercel
5. **Integrations** — [EXTERNAL_INTEGRATIONS.md](./EXTERNAL_INTEGRATIONS.md)
6. **Operations data** — [LAUNCH_OPS.md](./LAUNCH_OPS.md)
7. **Acceptance** — [MANUAL_ACCEPTANCE.md](./MANUAL_ACCEPTANCE.md)
8. **Go live** — [SOFT_LAUNCH.md](./SOFT_LAUNCH.md)

Ongoing operations: [RUNBOOK.md](./RUNBOOK.md)
