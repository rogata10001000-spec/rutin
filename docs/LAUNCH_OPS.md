# Launch Operations Bootstrap

Complete these steps in the **production** admin UI after deploy and before accepting paying users. See also [RUNBOOK.md](./RUNBOOK.md) Launch Checklist.

## 1. First Admin Staff

### Option A: Supabase Dashboard

1. **Authentication** → **Users** → **Add user** (email + password).
2. Copy the user UUID.
3. Run in SQL Editor ([`scripts/ops-bootstrap.sql`](../scripts/ops-bootstrap.sql) section 1), replacing placeholders.

### Option B: Existing admin invites via UI

After the first admin exists: **Admin → Staff → Invite** (`InviteStaffDialog`).

## 2. Cast and Supervisor Accounts

For each operator:

1. Create Auth user (email/password).
2. Insert `staff_profiles` with correct `role`, `capacity_limit`, `accepting_new_users`.
3. For casts: set `supervisor_id` if applicable (migration `20260506140000`).

## 3. Tax Rate

Confirm an active row exists in `tax_rates` (seeded by initial migration). If missing:

```sql
insert into public.tax_rates (id, name, rate, effective_from, active)
values (
  gen_random_uuid(),
  '消費税10%',
  0.1000,
  current_date,
  true
)
on conflict do nothing;
```

Verify in **Admin → Tax rates**.

## 4. Payout Rule (Subscription Share)

**Admin → Payout rules** → create at least one active `subscription_share` rule before paid subscriptions (required by runbook).

## 5. Plan Pricing

**Admin → Pricing** — set cast-specific price overrides if your business model requires them.

## 6. Cast Public Profiles

Each accepting cast should complete:

- Display name, public profile text
- Photos (up to 5) via **My photos** or admin photo management
- **Accepting new users** toggle as needed

Verify on `https://<APP_BASE_URL>/subscribe/cast`.

## 7. Cron Jobs

After `CRON_SECRET` is set on Vercel and [`vercel.json`](../vercel.json) is deployed:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://<APP_BASE_URL>/api/jobs/sla-alert"
# Expect 200
```

Check `audit_logs` for SLA / daily summary entries after the scheduled runs.

## Deferred (Post Soft Launch)

- Point product Stripe Price IDs (`REPLACE_ME` in seed migration)
- Gift catalog activation
- Settlement batch dry run
