/**
 * Stripe 連携の初期セットアップ（Product/Price/Webhook + Supabase plan_prices 同期）
 *
 * Usage: npx tsx scripts/setup-stripe.ts
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const ENV_PATH = resolve(process.cwd(), ".env.local");

const PLANS = [
  { code: "light", name: "Rutin Light", amount: 2980 },
  { code: "standard", name: "Rutin Standard", amount: 6980 },
  { code: "premium", name: "Rutin Premium", amount: 14800 },
] as const;

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function updateEnvFile(updates: Record<string, string>) {
  let content = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

async function findOrCreatePrice(
  stripe: Stripe,
  plan: (typeof PLANS)[number]
): Promise<string> {
  const products = await stripe.products.search({
    query: `active:'true' AND metadata['rutin_plan_code']:'${plan.code}'`,
  });

  let product = products.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      metadata: { rutin_plan_code: plan.code, rutin_managed: "true" },
    });
    console.log(`  created product ${product.id} (${plan.code})`);
  } else {
    console.log(`  found product ${product.id} (${plan.code})`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });

  const existing = prices.data.find(
    (p) =>
      p.currency === "jpy" &&
      p.unit_amount === plan.amount &&
      p.recurring?.interval === "month"
  );

  if (existing) {
    console.log(`  using price ${existing.id} (¥${plan.amount}/月)`);
    return existing.id;
  }

  const created = await stripe.prices.create({
    product: product.id,
    currency: "jpy",
    unit_amount: plan.amount,
    recurring: { interval: "month" },
    metadata: { rutin_plan_code: plan.code, rutin_managed: "true" },
  });
  console.log(`  created price ${created.id} (¥${plan.amount}/月)`);
  return created.id;
}

async function ensureWebhook(
  stripe: Stripe,
  url: string
): Promise<{ endpointId: string; secret: string; created: boolean }> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === url && e.status !== "disabled");

  if (existing) {
    const hasAllEvents = WEBHOOK_EVENTS.every((ev) =>
      existing.enabled_events.includes(ev)
    );
    if (hasAllEvents) {
      console.log(`  webhook already exists: ${existing.id}`);
      console.log(
        "  note: existing webhook secret cannot be retrieved via API; keeping STRIPE_WEBHOOK_SECRET in .env.local"
      );
      return { endpointId: existing.id, secret: "", created: false };
    }

    console.log(`  deleting outdated webhook ${existing.id}`);
    await stripe.webhookEndpoints.del(existing.id);
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: "Rutin production webhook (managed by setup-stripe.ts)",
  });

  console.log(`  created webhook ${endpoint.id}`);
  return { endpointId: endpoint.id, secret: endpoint.secret ?? "", created: true };
}

async function syncPlanPrices(
  supabaseUrl: string,
  serviceRoleKey: string,
  priceIds: Record<string, string>
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = new Date().toISOString().split("T")[0];

  for (const plan of PLANS) {
    const stripePriceId = priceIds[plan.code];

    const { data: existing } = await supabase
      .from("plan_prices")
      .select("id, stripe_price_id, amount_monthly, active")
      .eq("plan_code", plan.code)
      .eq("active", true)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existing &&
      existing.stripe_price_id === stripePriceId &&
      existing.amount_monthly === plan.amount
    ) {
      console.log(`  plan_prices ${plan.code}: already synced`);
      continue;
    }

    // plan_prices は (plan_code) 一意。月額のみ更新し、年額カラムは保持する。
    const { error } = await supabase.from("plan_prices").upsert(
      {
        plan_code: plan.code,
        currency: "JPY",
        amount_monthly: plan.amount,
        stripe_price_id: stripePriceId,
        valid_from: today,
        active: true,
      },
      { onConflict: "plan_code" }
    );

    if (error) {
      throw new Error(`plan_prices upsert failed (${plan.code}): ${error.message}`);
    }

    console.log(`  plan_prices ${plan.code}: upserted (${stripePriceId})`);
  }
}

async function main() {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  console.log(`Stripe mode: ${mode}`);

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  console.log("\n[1/3] Products & Prices");
  const priceIds: Record<string, string> = {};
  for (const plan of PLANS) {
    console.log(`- ${plan.code}`);
    priceIds[plan.code] = await findOrCreatePrice(stripe, plan);
  }

  console.log("\n[2/3] Webhook");
  const webhookUrl = `${appBaseUrl}/api/webhooks/stripe`;
  console.log(`- URL: ${webhookUrl}`);
  const webhook = await ensureWebhook(stripe, webhookUrl);

  const envUpdates: Record<string, string> = {
    STRIPE_PRICE_LIGHT: priceIds.light,
    STRIPE_PRICE_STANDARD: priceIds.standard,
    STRIPE_PRICE_PREMIUM: priceIds.premium,
  };
  if (webhook.created && webhook.secret) {
    envUpdates.STRIPE_WEBHOOK_SECRET = webhook.secret;
  }

  console.log("\n[3/3] Supabase plan_prices");
  await syncPlanPrices(supabaseUrl, serviceRoleKey, priceIds);

  updateEnvFile(envUpdates);
  console.log("\nUpdated .env.local:");
  for (const [k, v] of Object.entries(envUpdates)) {
    console.log(`  ${k}=${v}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
