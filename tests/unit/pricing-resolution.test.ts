import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    STRIPE_PRICE_LIGHT: "env_light_m",
    STRIPE_PRICE_STANDARD: "env_standard_m",
    STRIPE_PRICE_PREMIUM: "env_premium_m",
    STRIPE_PRICE_LIGHT_ANNUAL: "env_light_y",
    STRIPE_PRICE_STANDARD_ANNUAL: "env_standard_y",
    STRIPE_PRICE_PREMIUM_ANNUAL: "env_premium_y",
  }),
}));

import {
  resolvePlanPricing,
  resolvePlanCodeFromAppliedPrice,
} from "@/lib/plan-pricing";

type Tables = {
  plan_prices?: Record<string, unknown>[];
  cast_plan_price_overrides?: Record<string, unknown>[];
};

// テーブル名ごとに別の行を返すチェーンモック（.select().eq()...order() で解決）
function mockSupabase(tables: Tables) {
  return {
    from(table: string) {
      const rows = tables[table as keyof Tables] ?? [];
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof resolvePlanPricing>[0];
}

describe("resolvePlanPricing（間隔別の価格解決）", () => {
  it("plan_pricesのデフォルトを月額/年額それぞれ反映する", async () => {
    const supabase = mockSupabase({
      plan_prices: [
        {
          plan_code: "standard",
          amount_monthly: 7000,
          stripe_price_id: "pm_std",
          amount_annual: 70000,
          stripe_price_id_annual: "py_std",
          valid_from: "2026-01-01",
        },
      ],
    });

    const monthly = await resolvePlanPricing(supabase, null, "month");
    expect(monthly.standard).toEqual({ amount: 7000, stripePriceId: "pm_std" });

    const annual = await resolvePlanPricing(supabase, null, "year");
    expect(annual.standard).toEqual({ amount: 70000, stripePriceId: "py_std" });
  });

  it("年額がplan_pricesに無ければenvフォールバックを使う", async () => {
    const supabase = mockSupabase({
      plan_prices: [
        {
          plan_code: "standard",
          amount_monthly: 7000,
          stripe_price_id: "pm_std",
          amount_annual: null,
          stripe_price_id_annual: null,
          valid_from: "2026-01-01",
        },
      ],
    });
    const annual = await resolvePlanPricing(supabase, null, "year");
    // env_standard_y にフォールバック
    expect(annual.standard.stripePriceId).toBe("env_standard_y");
  });

  it("メイト別オーバーライドがデフォルトより優先される（月額・年額とも）", async () => {
    const supabase = mockSupabase({
      plan_prices: [
        {
          plan_code: "standard",
          amount_monthly: 7000,
          stripe_price_id: "pm_std",
          amount_annual: 70000,
          stripe_price_id_annual: "py_std",
          valid_from: "2026-01-01",
        },
      ],
      cast_plan_price_overrides: [
        {
          plan_code: "standard",
          amount_monthly: 5000,
          stripe_price_id: "pm_cast",
          amount_annual: 50000,
          stripe_price_id_annual: "py_cast",
          valid_from: "2026-02-01",
        },
      ],
    });

    const monthly = await resolvePlanPricing(supabase, "cast-1", "month");
    expect(monthly.standard).toEqual({ amount: 5000, stripePriceId: "pm_cast" });

    const annual = await resolvePlanPricing(supabase, "cast-1", "year");
    expect(annual.standard).toEqual({ amount: 50000, stripePriceId: "py_cast" });
  });

  it("メイト別の年額が未設定ならデフォルト年額が使われる", async () => {
    const supabase = mockSupabase({
      plan_prices: [
        {
          plan_code: "standard",
          amount_monthly: 7000,
          stripe_price_id: "pm_std",
          amount_annual: 70000,
          stripe_price_id_annual: "py_std",
          valid_from: "2026-01-01",
        },
      ],
      cast_plan_price_overrides: [
        {
          plan_code: "standard",
          amount_monthly: 5000,
          stripe_price_id: "pm_cast",
          amount_annual: null,
          stripe_price_id_annual: null,
          valid_from: "2026-02-01",
        },
      ],
    });
    const annual = await resolvePlanPricing(supabase, "cast-1", "year");
    expect(annual.standard).toEqual({ amount: 70000, stripePriceId: "py_std" });
  });
});

describe("resolvePlanCodeFromAppliedPrice（price_id逆引き・両間隔）", () => {
  const tables: Tables = {
    plan_prices: [
      {
        plan_code: "premium",
        amount_monthly: 14800,
        stripe_price_id: "pm_prem",
        amount_annual: 148000,
        stripe_price_id_annual: "py_prem",
        valid_from: "2026-01-01",
      },
    ],
  };

  it("月額Priceから逆引きできる", async () => {
    const code = await resolvePlanCodeFromAppliedPrice(mockSupabase(tables), null, "pm_prem");
    expect(code).toBe("premium");
  });

  it("年額Priceからも逆引きできる", async () => {
    const code = await resolvePlanCodeFromAppliedPrice(mockSupabase(tables), null, "py_prem");
    expect(code).toBe("premium");
  });

  it("未知のPriceはnull", async () => {
    const code = await resolvePlanCodeFromAppliedPrice(mockSupabase(tables), null, "unknown");
    expect(code).toBeNull();
  });
});
