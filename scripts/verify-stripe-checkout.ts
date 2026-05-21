/**
 * 本番 Stripe Checkout の動作確認
 *
 * Usage: npx tsx scripts/verify-stripe-checkout.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function main() {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/$/, "");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!secretKey.startsWith("sk_live_")) {
    throw new Error("Expected live Stripe key (sk_live_)");
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("[1/4] Price IDs");
  for (const plan of ["light", "standard", "premium"] as const) {
    const envName = `STRIPE_PRICE_${plan.toUpperCase()}` as const;
    const priceId = requireEnv(envName);
    const price = await stripe.prices.retrieve(priceId);
    if (!price.livemode) throw new Error(`${priceId} is not live mode`);
    console.log(`  ${plan}: ${priceId} (¥${price.unit_amount}/月)`);
  }

  console.log("\n[2/4] Webhook endpoint");
  const webhookUrl = `${appBaseUrl}/api/webhooks/stripe`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  const webhook = endpoints.data.find((e) => e.url === webhookUrl && e.status === "enabled");
  if (!webhook) throw new Error(`Webhook not found for ${webhookUrl}`);
  console.log(`  ${webhook.id} enabled (${webhook.enabled_events.length} events)`);

  console.log("\n[3/4] Supabase cast + plan_prices");
  const { data: cast, error: castError } = await supabase
    .from("staff_profiles")
    .select("id, display_name, accepting_new_users")
    .eq("role", "cast")
    .eq("active", true)
    .eq("accepting_new_users", true)
    .limit(1)
    .single();

  if (castError || !cast) {
    throw new Error("No active cast accepting new users found");
  }
  console.log(`  cast: ${cast.display_name} (${cast.id})`);

  const { data: planPrice } = await supabase
    .from("plan_prices")
    .select("stripe_price_id")
    .eq("plan_code", "standard")
    .eq("active", true)
    .order("valid_from", { ascending: false })
    .limit(1)
    .single();

  if (!planPrice?.stripe_price_id) {
    throw new Error("Active standard plan_price not found");
  }
  console.log(`  standard price: ${planPrice.stripe_price_id}`);

  console.log("\n[4/4] Create live Checkout Session");
  const lineUserId = `verify_${Date.now()}`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: planPrice.stripe_price_id, quantity: 1 }],
    subscription_data: {
      trial_period_days: Number(process.env.TRIAL_PERIOD_DAYS ?? 7),
      metadata: {
        line_user_id: lineUserId,
        cast_id: cast.id,
        plan_code: "standard",
        stripe_price_id: planPrice.stripe_price_id,
      },
    },
    metadata: {
      line_user_id: lineUserId,
      cast_id: cast.id,
      plan_code: "standard",
      stripe_price_id: planPrice.stripe_price_id,
      type: "subscription",
      verification: "true",
    },
    success_url: `${appBaseUrl}/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl}/subscribe?canceled=true`,
  });

  if (!session.url) throw new Error("Checkout session URL is null");

  const checkoutRes = await fetch(session.url, { method: "GET", redirect: "manual" });
  console.log(`  session: ${session.id}`);
  console.log(`  checkout page status: ${checkoutRes.status}`);
  if (checkoutRes.status !== 200 && checkoutRes.status !== 303) {
    throw new Error(`Unexpected checkout page status: ${checkoutRes.status}`);
  }

  await stripe.checkout.sessions.expire(session.id);
  console.log("  session expired (verification only, no charge)");

  console.log("\nCheckout verification passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
