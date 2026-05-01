alter table public.webhook_events
  add column if not exists status text not null default 'processing',
  add column if not exists processing_started_at timestamptz null,
  add column if not exists attempt_count int not null default 1;

update public.webhook_events
set
  status = case
    when success = true then 'processed'
    when processed_at is not null then 'failed'
    else 'processing'
  end,
  processing_started_at = coalesce(processing_started_at, received_at)
where status not in ('processing', 'processed', 'failed')
  or processing_started_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhook_events_status_check'
      and conrelid = 'public.webhook_events'::regclass
  ) then
    alter table public.webhook_events
      add constraint webhook_events_status_check
      check (status in ('processing', 'processed', 'failed'));
  end if;
end;
$$;

create index if not exists idx_webhook_events_status
  on public.webhook_events(provider, status, received_at desc);
