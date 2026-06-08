import { getServerEnv } from "@/lib/env";
import type { PlanCode } from "@/lib/supabase/types";
import type { createAdminSupabaseClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export const PLAN_CODES: PlanCode[] = ["light", "standard", "premium"];

export const PLAN_LABELS: Record<PlanCode, string> = {
  light: "ライト",
  standard: "スタンダード",
  premium: "プレミアム",
};

export const PLAN_DESCRIPTIONS: Record<PlanCode, string> = {
  light: "気軽にメッセージで相談したい方向け",
  standard: "毎日のチェックインで継続的にサポート",
  premium: "優先返信と週次レビューで集中サポート",
};

export const PLAN_SLA_LABELS: Record<PlanCode, string> = {
  light: "24時間以内",
  standard: "12時間以内",
  premium: "2時間以内",
};

// plan_prices テーブルが空のときのフォールバック価格
export const DEFAULT_PLAN_PRICES: Record<PlanCode, number> = {
  light: 2980,
  standard: 6980,
  premium: 14800,
};

export function defaultStripePriceIds(): Record<PlanCode, string> {
  const env = getServerEnv();
  return {
    light: env.STRIPE_PRICE_LIGHT ?? "",
    standard: env.STRIPE_PRICE_STANDARD ?? "",
    premium: env.STRIPE_PRICE_PREMIUM ?? "",
  };
}

export type ResolvedPlanPricing = Record<
  PlanCode,
  { amount: number; stripePriceId: string }
>;

/**
 * 担当メイトのプラン価格を解決する（オーバーライド > デフォルト）。
 * castId が null の場合はデフォルト価格のみを返す。
 */
export async function resolveCastPlanPricing(
  supabase: SupabaseAdmin,
  castId: string | null
): Promise<ResolvedPlanPricing> {
  const defaults = defaultStripePriceIds();
  const pricing: ResolvedPlanPricing = {
    light: { amount: DEFAULT_PLAN_PRICES.light, stripePriceId: defaults.light },
    standard: { amount: DEFAULT_PLAN_PRICES.standard, stripePriceId: defaults.standard },
    premium: { amount: DEFAULT_PLAN_PRICES.premium, stripePriceId: defaults.premium },
  };

  if (!castId) {
    return pricing;
  }

  const { data } = await supabase
    .from("cast_plan_price_overrides")
    .select("plan_code, amount_monthly, stripe_price_id, valid_from")
    .eq("cast_id", castId)
    .eq("active", true)
    .order("valid_from", { ascending: false });

  const seen = new Set<PlanCode>();
  for (const ov of data ?? []) {
    const code = ov.plan_code as PlanCode;
    if (!PLAN_CODES.includes(code) || seen.has(code)) continue;
    pricing[code] = { amount: ov.amount_monthly, stripePriceId: ov.stripe_price_id };
    seen.add(code);
  }

  return pricing;
}

/**
 * Stripe Price ID から plan_code を逆引きする。
 */
export function planCodeFromStripePriceId(
  pricing: ResolvedPlanPricing,
  stripePriceId: string | null
): PlanCode | null {
  if (!stripePriceId) return null;
  for (const code of PLAN_CODES) {
    if (pricing[code].stripePriceId === stripePriceId) {
      return code;
    }
  }
  return null;
}
