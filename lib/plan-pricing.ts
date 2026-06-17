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

export type BillingInterval = "month" | "year";

// 年額は月額×10（実質2ヶ月無料）。年額は全プランでデフォルト価格を使用（メイト別オーバーライドは月額のみ）。
export const ANNUAL_PRICE_MULTIPLIER = 12 - 2;

export const DEFAULT_ANNUAL_PRICES: Record<PlanCode, number> = {
  light: DEFAULT_PLAN_PRICES.light * ANNUAL_PRICE_MULTIPLIER,
  standard: DEFAULT_PLAN_PRICES.standard * ANNUAL_PRICE_MULTIPLIER,
  premium: DEFAULT_PLAN_PRICES.premium * ANNUAL_PRICE_MULTIPLIER,
};

export function annualStripePriceIds(): Record<PlanCode, string> {
  const env = getServerEnv();
  return {
    light: env.STRIPE_PRICE_LIGHT_ANNUAL ?? "",
    standard: env.STRIPE_PRICE_STANDARD_ANNUAL ?? "",
    premium: env.STRIPE_PRICE_PREMIUM_ANNUAL ?? "",
  };
}

/** 年額プランが利用可能か（全プランの年額Priceが設定済みか）。未設定なら年額導線を出さない。 */
export function isAnnualEnabled(): boolean {
  const ids = annualStripePriceIds();
  return PLAN_CODES.every((code) => Boolean(ids[code]));
}

/** 指定の stripe_price_id が年額プランのものか判定する（請求間隔の推定用）。 */
export function isAnnualPriceId(stripePriceId: string | null): boolean {
  if (!stripePriceId) return false;
  const ids = annualStripePriceIds();
  return PLAN_CODES.some((code) => ids[code] === stripePriceId);
}

export type ResolvedPlanPricing = Record<
  PlanCode,
  { amount: number; stripePriceId: string }
>;

/** env / ハードコードを最終フォールバックとしたデフォルト価格（間隔別）。 */
function fallbackPricingForInterval(interval: BillingInterval): ResolvedPlanPricing {
  const monthIds = defaultStripePriceIds();
  const yearIds = annualStripePriceIds();
  const amounts = interval === "year" ? DEFAULT_ANNUAL_PRICES : DEFAULT_PLAN_PRICES;
  const ids = interval === "year" ? yearIds : monthIds;
  return {
    light: { amount: amounts.light, stripePriceId: ids.light },
    standard: { amount: amounts.standard, stripePriceId: ids.standard },
    premium: { amount: amounts.premium, stripePriceId: ids.premium },
  };
}

/**
 * 指定間隔のプラン価格を解決する。
 * 優先順位: メイト別オーバーライド > plan_prices(管理画面デフォルト) > env/ハードコード(最終フォールバック)。
 * 年額が未設定のプランは stripePriceId が "" になる（呼び出し側でゲートする）。
 * castId が null の場合はメイト別オーバーライドを適用しない。
 */
export async function resolvePlanPricing(
  supabase: SupabaseAdmin,
  castId: string | null,
  interval: BillingInterval
): Promise<ResolvedPlanPricing> {
  const pricing = fallbackPricingForInterval(interval);

  // 1) 管理画面デフォルト（plan_prices）
  const { data: planRows } = await supabase
    .from("plan_prices")
    .select(
      "plan_code, amount_monthly, stripe_price_id, amount_annual, stripe_price_id_annual, valid_from"
    )
    .eq("active", true)
    .order("valid_from", { ascending: false });

  const seenDefault = new Set<PlanCode>();
  for (const row of planRows ?? []) {
    const code = row.plan_code as PlanCode;
    if (!PLAN_CODES.includes(code) || seenDefault.has(code)) continue;
    seenDefault.add(code);
    if (interval === "year") {
      if (row.amount_annual != null && row.stripe_price_id_annual) {
        pricing[code] = {
          amount: row.amount_annual,
          stripePriceId: row.stripe_price_id_annual,
        };
      }
    } else if (row.amount_monthly != null && row.stripe_price_id) {
      pricing[code] = { amount: row.amount_monthly, stripePriceId: row.stripe_price_id };
    }
  }

  // 2) メイト別オーバーライド
  if (castId) {
    const { data: ovRows } = await supabase
      .from("cast_plan_price_overrides")
      .select(
        "plan_code, amount_monthly, stripe_price_id, amount_annual, stripe_price_id_annual, valid_from"
      )
      .eq("cast_id", castId)
      .eq("active", true)
      .order("valid_from", { ascending: false });

    const seenOv = new Set<PlanCode>();
    for (const ov of ovRows ?? []) {
      const code = ov.plan_code as PlanCode;
      if (!PLAN_CODES.includes(code) || seenOv.has(code)) continue;
      seenOv.add(code);
      if (interval === "year") {
        if (ov.amount_annual != null && ov.stripe_price_id_annual) {
          pricing[code] = {
            amount: ov.amount_annual,
            stripePriceId: ov.stripe_price_id_annual,
          };
        }
      } else {
        pricing[code] = { amount: ov.amount_monthly, stripePriceId: ov.stripe_price_id };
      }
    }
  }

  return pricing;
}

/**
 * 担当メイトの月額プラン価格を解決する（後方互換のラッパー）。
 * 既存の月額前提の呼び出し元はこちらを使う。
 */
export async function resolveCastPlanPricing(
  supabase: SupabaseAdmin,
  castId: string | null
): Promise<ResolvedPlanPricing> {
  return resolvePlanPricing(supabase, castId, "month");
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

/**
 * 適用中の Stripe Price ID から plan_code を逆引きする（月額/年額の両方を探索）。
 * メイト別の年額 price_id も解決できるよう、両間隔を解決して突き合わせる。
 */
export async function resolvePlanCodeFromAppliedPrice(
  supabase: SupabaseAdmin,
  castId: string | null,
  stripePriceId: string | null
): Promise<PlanCode | null> {
  if (!stripePriceId) return null;
  const monthly = await resolvePlanPricing(supabase, castId, "month");
  const fromMonthly = planCodeFromStripePriceId(monthly, stripePriceId);
  if (fromMonthly) return fromMonthly;
  const annual = await resolvePlanPricing(supabase, castId, "year");
  return planCodeFromStripePriceId(annual, stripePriceId);
}
