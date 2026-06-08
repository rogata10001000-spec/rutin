import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    STRIPE_PRICE_LIGHT: "price_light_default",
    STRIPE_PRICE_STANDARD: "price_standard_default",
    STRIPE_PRICE_PREMIUM: "price_premium_default",
  }),
}));

import {
  DEFAULT_PLAN_PRICES,
  defaultStripePriceIds,
  planCodeFromStripePriceId,
  resolveCastPlanPricing,
  type ResolvedPlanPricing,
} from "@/lib/plan-pricing";

type OverrideRow = {
  plan_code: string;
  amount_monthly: number;
  stripe_price_id: string;
  valid_from: string;
};

// cast_plan_price_overrides の order().eq().eq() チェーンを最小限モックする
function mockSupabase(rows: OverrideRow[]) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({ data: rows, error: null });
        },
      };
    },
  } as unknown as Parameters<typeof resolveCastPlanPricing>[0];
}

describe("lib/plan-pricing", () => {
  it("defaultStripePriceIds reads env", () => {
    expect(defaultStripePriceIds()).toEqual({
      light: "price_light_default",
      standard: "price_standard_default",
      premium: "price_premium_default",
    });
  });

  it("resolveCastPlanPricing returns defaults when castId is null", async () => {
    const pricing = await resolveCastPlanPricing(mockSupabase([]), null);
    expect(pricing.light.amount).toBe(DEFAULT_PLAN_PRICES.light);
    expect(pricing.standard.stripePriceId).toBe("price_standard_default");
  });

  it("resolveCastPlanPricing applies overrides and prefers latest valid_from", async () => {
    const pricing = await resolveCastPlanPricing(
      mockSupabase([
        {
          plan_code: "premium",
          amount_monthly: 20000,
          stripe_price_id: "price_premium_new",
          valid_from: "2026-06-01",
        },
        {
          plan_code: "premium",
          amount_monthly: 18000,
          stripe_price_id: "price_premium_old",
          valid_from: "2026-01-01",
        },
        {
          plan_code: "light",
          amount_monthly: 2500,
          stripe_price_id: "price_light_cast",
          valid_from: "2026-05-01",
        },
      ]),
      "cast-1"
    );

    expect(pricing.premium).toEqual({ amount: 20000, stripePriceId: "price_premium_new" });
    expect(pricing.light).toEqual({ amount: 2500, stripePriceId: "price_light_cast" });
    // override の無い standard はデフォルト
    expect(pricing.standard.stripePriceId).toBe("price_standard_default");
  });

  it("planCodeFromStripePriceId reverse-lookups by price id", () => {
    const pricing: ResolvedPlanPricing = {
      light: { amount: 2980, stripePriceId: "price_l" },
      standard: { amount: 6980, stripePriceId: "price_s" },
      premium: { amount: 14800, stripePriceId: "price_p" },
    };
    expect(planCodeFromStripePriceId(pricing, "price_s")).toBe("standard");
    expect(planCodeFromStripePriceId(pricing, "price_p")).toBe("premium");
    expect(planCodeFromStripePriceId(pricing, "unknown")).toBeNull();
    expect(planCodeFromStripePriceId(pricing, null)).toBeNull();
  });
});
