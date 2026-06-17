import { stripe } from "@/lib/stripe";
import type { PlanCode } from "@/lib/supabase/types";
import type { BillingInterval } from "@/lib/plan-pricing";

/**
 * 「金額」を単一の真実として Stripe Price を find-or-create するためのヘルパー。
 *
 * 管理画面では金額のみを入力し、ここで対応する Stripe Price を生成/再利用する。
 * これにより「画面の表示額」と「実際の請求額(Stripe Priceのunit_amount)」が
 * 構造的に必ず一致する（手入力 price_id と金額が食い違うバグを根絶）。
 */

const PLAN_PRODUCT_NAMES: Record<PlanCode, string> = {
  light: "Rutin Light",
  standard: "Rutin Standard",
  premium: "Rutin Premium",
};

/** plan_code ごとの Stripe Product を find-or-create する。 */
async function ensureProduct(planCode: PlanCode): Promise<string> {
  const found = await stripe.products.search({
    query: `active:'true' AND metadata['rutin_plan_code']:'${planCode}'`,
  });
  const existing = found.data[0];
  if (existing) return existing.id;

  const created = await stripe.products.create({
    name: PLAN_PRODUCT_NAMES[planCode],
    metadata: { rutin_plan_code: planCode, rutin_managed: "true" },
  });
  return created.id;
}

/**
 * 金額(JPY・税込)と請求間隔から、対応する Stripe Price を find-or-create する。
 * 同一 (product, currency=jpy, unit_amount, interval) の active Price があれば再利用するため冪等。
 * Stripe の Price は金額変更不可（イミュータブル）なので、金額が変われば新しい Price が作られる。
 *
 * @returns 確定した Stripe Price ID
 */
export async function ensureRecurringPrice(
  planCode: PlanCode,
  amountJpy: number,
  interval: BillingInterval
): Promise<string> {
  if (!Number.isInteger(amountJpy) || amountJpy <= 0) {
    throw new Error(`ensureRecurringPrice: 金額が不正です (${amountJpy})`);
  }

  const productId = await ensureProduct(planCode);

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const existing = prices.data.find(
    (p) =>
      p.currency === "jpy" &&
      p.unit_amount === amountJpy &&
      p.recurring?.interval === interval
  );
  if (existing) return existing.id;

  const created = await stripe.prices.create({
    product: productId,
    currency: "jpy",
    unit_amount: amountJpy,
    recurring: { interval },
    metadata: {
      rutin_plan_code: planCode,
      rutin_managed: "true",
      rutin_interval: interval,
    },
  });
  return created.id;
}
