-- Allow audit targets to reference external IDs such as Stripe/LINE IDs.
alter table public.audit_logs
  alter column target_id type text
  using target_id::text;

drop index if exists public.idx_audit_logs_target;
create index if not exists idx_audit_logs_target on public.audit_logs(target_type, target_id);
