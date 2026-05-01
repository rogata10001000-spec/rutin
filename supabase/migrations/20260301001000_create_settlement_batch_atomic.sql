create or replace function public.create_settlement_batch_atomic(
  p_period_from date,
  p_period_to date,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_total_amount int;
  v_target_count int;
  v_updated_count int;
begin
  if p_period_from > p_period_to then
    raise exception using errcode = '22007', message = 'INVALID_SETTLEMENT_PERIOD';
  end if;

  perform pg_advisory_xact_lock(hashtext('create_settlement_batch_atomic'));

  create temporary table if not exists settlement_target_calculations (
    calculation_id uuid primary key,
    cast_id uuid not null,
    amount_jpy int not null,
    revenue_event_id uuid not null,
    occurred_on date not null,
    source_ref_type text not null,
    metadata jsonb not null
  ) on commit drop;

  truncate table settlement_target_calculations;

  insert into settlement_target_calculations (
    calculation_id,
    cast_id,
    amount_jpy,
    revenue_event_id,
    occurred_on,
    source_ref_type,
    metadata
  )
  select
    pc.id,
    pc.cast_id,
    pc.amount_jpy,
    re.id,
    re.occurred_on,
    re.source_ref_type,
    re.metadata
  from public.payout_calculations pc
  join public.revenue_events re on re.id = pc.revenue_event_id
  where pc.settlement_batch_id is null
    and re.occurred_on >= p_period_from
    and re.occurred_on <= p_period_to
  for update of pc skip locked;

  select count(*), coalesce(sum(amount_jpy), 0)::int
    into v_target_count, v_total_amount
  from settlement_target_calculations;

  if v_target_count = 0 then
    raise exception using errcode = 'P0002', message = 'NO_SETTLEMENT_TARGETS';
  end if;

  insert into public.settlement_batches (
    period_from,
    period_to,
    status,
    total_amount_jpy,
    created_by
  )
  values (
    p_period_from,
    p_period_to,
    'draft',
    v_total_amount,
    p_created_by
  )
  returning id into v_batch_id;

  insert into public.settlement_items (
    batch_id,
    cast_id,
    amount_jpy,
    breakdown
  )
  select
    v_batch_id,
    target.cast_id,
    sum(target.amount_jpy)::int,
    jsonb_build_object(
      'calculation_count', count(*),
      'invoice_count', count(*) filter (where target.source_ref_type = 'stripe_invoice'),
      'revenue_event_ids', jsonb_agg(target.revenue_event_id order by target.occurred_on, target.revenue_event_id),
      'plan_codes', jsonb_agg(distinct target.metadata ->> 'plan_code')
    )
  from settlement_target_calculations target
  group by target.cast_id;

  update public.payout_calculations pc
  set settlement_batch_id = v_batch_id
  from settlement_target_calculations target
  where pc.id = target.calculation_id
    and pc.settlement_batch_id is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_target_count then
    raise exception using errcode = '40001', message = 'SETTLEMENT_TARGET_CHANGED';
  end if;

  return v_batch_id;
end;
$$;

revoke all on function public.create_settlement_batch_atomic(date, date, uuid) from public;
revoke all on function public.create_settlement_batch_atomic(date, date, uuid) from anon;
revoke all on function public.create_settlement_batch_atomic(date, date, uuid) from authenticated;
grant execute on function public.create_settlement_batch_atomic(date, date, uuid) to service_role;
