/**
 * 年額プランの Stripe Price を作成する（既存の月額Priceと同じ商品に、月額×10・interval=yearで作成）。
 * 冪等: 同条件のPriceが既にあれば再利用。シークレットは出力しない。
 *
 * Usage: npx tsx scripts/create-annual-prices.ts
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const ENV_PATH = resolve(process.cwd(), ".env.local");
const ANNUAL_MULTIPLIER = 10; // 実質2ヶ月無料

const PLANS = [
  { code: "light", monthlyEnv: "STRIPE_PRICE_LIGHT", annualEnv: "STRIPE_PRICE_LIGHT_ANNUAL" },
  { code: "standard", monthlyEnv: "STRIPE_PRICE_STANDARD", annualEnv: "STRIPE_PRICE_STANDARD_ANNUAL" },
  { code: "premium", monthlyEnv: "STRIPE_PRICE_PREMIUM", annualEnv: "STRIPE_PRICE_PREMIUM_ANNUAL" },
] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function updateEnvFile(updates: Record<string, string>) {
  let content = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) content = content.replace(pattern, `${key}=${value}`);
    else content += `\n${key}=${value}`;
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

async function main() {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const mode = secretKey.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.log(`Stripe mode: ${mode}`);

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  const envUpdates: Record<string, string> = {};

  for (const plan of PLANS) {
    const monthlyId = process.env[plan.monthlyEnv];
    if (!monthlyId) {
      console.log(`- ${plan.code}: ${plan.monthlyEnv} 未設定のためスキップ`);
      continue;
    }

    const monthly = await stripe.prices.retrieve(monthlyId);
    const productId = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
    const currency = monthly.currency;
    const annualAmount = (monthly.unit_amount ?? 0) * ANNUAL_MULTIPLIER;
    if (annualAmount <= 0) {
      console.log(`- ${plan.code}: 月額金額が取得できずスキップ`);
      continue;
    }

    const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    const existing = prices.data.find(
      (p) => p.currency === currency && p.unit_amount === annualAmount && p.recurring?.interval === "year"
    );

    let annualId: string;
    if (existing) {
      annualId = existing.id;
      console.log(`- ${plan.code}: 既存の年額Priceを再利用 ${annualId} (${annualAmount} ${currency}/year)`);
    } else {
      const created = await stripe.prices.create({
        product: productId,
        currency,
        unit_amount: annualAmount,
        recurring: { interval: "year" },
        metadata: { rutin_plan_code: plan.code, rutin_interval: "annual", rutin_managed: "true" },
      });
      annualId = created.id;
      console.log(`- ${plan.code}: 年額Priceを作成 ${annualId} (${annualAmount} ${currency}/year)`);
    }

    envUpdates[plan.annualEnv] = annualId;
  }

  if (Object.keys(envUpdates).length > 0) {
    updateEnvFile(envUpdates);
    console.log("\n.env.local を更新しました:");
    for (const [k, v] of Object.entries(envUpdates)) console.log(`  ${k}=${v}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
