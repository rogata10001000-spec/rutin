-- Initial point products data (MVP lineup)
-- Using ON CONFLICT DO NOTHING for idempotency
-- Note: stripe_price_id must be replaced with actual Stripe Price IDs

insert into public.point_products (id, name, points, price_excl_tax_jpy, tax_rate_id, price_incl_tax_jpy, stripe_price_id, active, created_at)
values
  (
    '00000000-0000-0000-0001-000000000001'::uuid,
    '1,000ポイント',
    1000,
    1000,
    (select id from public.tax_rates where rate = 0.1000 and active = true order by effective_from desc limit 1),
    1100,
    'price_1000pt_REPLACE_ME',
    true,
    now()
  ),
  (
    '00000000-0000-0000-0001-000000000002'::uuid,
    '3,000ポイント',
    3000,
    2800,
    (select id from public.tax_rates where rate = 0.1000 and active = true order by effective_from desc limit 1),
    3080,
    'price_3000pt_REPLACE_ME',
    true,
    now()
  ),
  (
    '00000000-0000-0000-0001-000000000003'::uuid,
    '5,000ポイント',
    5000,
    4500,
    (select id from public.tax_rates where rate = 0.1000 and active = true order by effective_from desc limit 1),
    4950,
    'price_5000pt_REPLACE_ME',
    true,
    now()
  ),
  (
    '00000000-0000-0000-0001-000000000004'::uuid,
    '10,000ポイント',
    10000,
    8500,
    (select id from public.tax_rates where rate = 0.1000 and active = true order by effective_from desc limit 1),
    9350,
    'price_10000pt_REPLACE_ME',
    true,
    now()
  )
on conflict (id) do nothing;

-- Note: Before running this migration, create Stripe Price objects and replace the REPLACE_ME placeholders
