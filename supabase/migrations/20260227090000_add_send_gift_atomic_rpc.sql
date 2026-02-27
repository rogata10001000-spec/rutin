-- Atomic gift send RPC to prevent partial writes.
create or replace function public.send_gift_atomic(
  p_line_user_id text,
  p_gift_id uuid
)
returns table (
  gift_send_id uuid,
  revenue_event_id uuid,
  payout_id uuid,
  cost_points int,
  gift_name text,
  payout_percent numeric,
  tax_jpy int,
  amount_excl_tax int,
  amount_incl_tax int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_cast_id uuid;
  v_gift record;
  v_tax record;
  v_rule record;
  v_balance int;
  v_occurred_on date;
  v_message_id uuid;
begin
  select id, assigned_cast_id
    into v_user_id, v_cast_id
  from public.end_users
  where line_user_id = p_line_user_id
  for update;

  if v_user_id is null or v_cast_id is null then
    raise exception 'USER_OR_CAST_NOT_FOUND';
  end if;

  select *
    into v_gift
  from public.gift_catalog
  where id = p_gift_id
    and active = true;

  if v_gift.id is null then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select coalesce(sum(delta_points), 0)::int
    into v_balance
  from public.user_point_ledger
  where end_user_id = v_user_id;

  if v_balance < v_gift.cost_points then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  select *
    into v_tax
  from public.tax_rates
  where active = true
  order by effective_from desc
  limit 1;

  if v_tax.id is null then
    raise exception 'TAX_RATE_NOT_FOUND';
  end if;

  select *
    into v_rule
  from public.payout_rules
  where rule_type = 'gift_share'
    and scope_type = 'cast'
    and cast_id = v_cast_id
    and active = true
    and effective_from <= now()::date
  order by effective_from desc
  limit 1;

  if v_rule.id is null then
    select *
      into v_rule
    from public.payout_rules
    where rule_type = 'gift_share'
      and scope_type = 'global'
      and active = true
      and effective_from <= now()::date
    order by effective_from desc
    limit 1;
  end if;

  if v_rule.id is null then
    raise exception 'PAYOUT_RULE_NOT_FOUND';
  end if;

  v_occurred_on := (now() at time zone 'Asia/Tokyo')::date;
  amount_excl_tax := v_gift.cost_points;
  tax_jpy := floor(amount_excl_tax * v_tax.rate);
  amount_incl_tax := amount_excl_tax + tax_jpy;
  payout_percent := v_rule.percent;
  cost_points := v_gift.cost_points;
  gift_name := v_gift.name;

  insert into public.gift_sends (end_user_id, cast_id, gift_id, cost_points)
  values (v_user_id, v_cast_id, v_gift.id, v_gift.cost_points)
  returning id into gift_send_id;

  insert into public.user_point_ledger (end_user_id, delta_points, reason, ref_type, ref_id)
  values (v_user_id, -v_gift.cost_points, 'gift_redeem', 'gift_send', gift_send_id::text);

  insert into public.revenue_events (
    event_type,
    end_user_id,
    cast_id,
    occurred_on,
    amount_excl_tax_jpy,
    tax_rate_id,
    tax_jpy,
    amount_incl_tax_jpy,
    source_ref_type,
    source_ref_id,
    metadata
  )
  values (
    'gift_redeem',
    v_user_id,
    v_cast_id,
    v_occurred_on,
    amount_excl_tax,
    v_tax.id,
    tax_jpy,
    amount_incl_tax,
    'gift_send',
    gift_send_id::text,
    jsonb_build_object('gift_id', v_gift.id, 'gift_name', v_gift.name)
  )
  returning id into revenue_event_id;

  insert into public.payout_calculations (
    revenue_event_id,
    cast_id,
    rule_id,
    percent_snapshot,
    amount_jpy
  )
  values (
    revenue_event_id,
    v_cast_id,
    v_rule.id,
    v_rule.percent,
    floor(amount_excl_tax * v_rule.percent / 100)
  )
  returning id into payout_id;

  insert into public.messages (end_user_id, direction, body, sent_by_staff_id)
  values (v_user_id, 'in', format('🎁 %s %s を送りました', coalesce(v_gift.icon, '🎁'), v_gift.name), null)
  returning id into v_message_id;

  update public.gift_sends
  set message_id = v_message_id
  where id = gift_send_id;

  return next;
end;
$$;

revoke all on function public.send_gift_atomic(text, uuid) from public;
revoke all on function public.send_gift_atomic(text, uuid) from anon;
revoke all on function public.send_gift_atomic(text, uuid) from authenticated;
grant execute on function public.send_gift_atomic(text, uuid) to service_role;
