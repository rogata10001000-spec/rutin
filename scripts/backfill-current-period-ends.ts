import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function currentPeriodEndFromStripeSubscription(subscription: Stripe.Subscription): string | null {
  const withItemPeriods = subscription as Stripe.Subscription & {
    items?: { data?: Array<{ current_period_end?: number | null }> };
    current_period_end?: number | null;
  };
  const unix = withItemPeriods.items?.data?.[0]?.current_period_end ?? withItemPeriods.current_period_end;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-02-24.acacia",
  });

  const { data: subscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, current_period_end")
    .eq("cancel_at_period_end", true)
    .is("current_period_end", null);

  if (error) {
    throw new Error(`Failed to fetch subscriptions: ${error.message}`);
  }

  let updated = 0;
  let skipped = 0;

  for (const subscription of subscriptions ?? []) {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );
    const currentPeriodEnd = currentPeriodEndFromStripeSubscription(stripeSubscription);

    if (!currentPeriodEnd) {
      skipped += 1;
      console.log(`skip ${subscription.id}: current_period_end not found`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ current_period_end: currentPeriodEnd })
      .eq("id", subscription.id);

    if (updateError) {
      throw new Error(`Failed to update ${subscription.id}: ${updateError.message}`);
    }

    updated += 1;
    console.log(`updated ${subscription.id}: ${currentPeriodEnd}`);
  }

  console.log(`Backfill complete. updated=${updated} skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
