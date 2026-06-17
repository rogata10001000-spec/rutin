import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    TRIAL_PERIOD_DAYS: 7,
    STRIPE_PRICE_LIGHT: "price_light_m",
    STRIPE_PRICE_STANDARD: "price_standard_m",
    STRIPE_PRICE_PREMIUM: "price_premium_m",
    STRIPE_PRICE_LIGHT_ANNUAL: "price_light_y",
    STRIPE_PRICE_STANDARD_ANNUAL: "price_standard_y",
    STRIPE_PRICE_PREMIUM_ANNUAL: "price_premium_y",
  }),
}));

import {
  ANNUAL_PRICE_MULTIPLIER,
  DEFAULT_PLAN_PRICES,
  DEFAULT_ANNUAL_PRICES,
  annualStripePriceIds,
  isAnnualEnabled,
  isAnnualPriceId,
} from "@/lib/plan-pricing";
import { getTrialPeriodDaysForPlan, getCompleteMessage } from "@/lib/trial";

describe("年額プラン: 価格計算", () => {
  it("年額は月額×10（実質2ヶ月無料）", () => {
    expect(ANNUAL_PRICE_MULTIPLIER).toBe(10);
    expect(DEFAULT_ANNUAL_PRICES.light).toBe(DEFAULT_PLAN_PRICES.light * 10);
    expect(DEFAULT_ANNUAL_PRICES.standard).toBe(DEFAULT_PLAN_PRICES.standard * 10);
    expect(DEFAULT_ANNUAL_PRICES.premium).toBe(DEFAULT_PLAN_PRICES.premium * 10);
  });

  it("annualStripePriceIds は env の年額Priceを返す", () => {
    expect(annualStripePriceIds()).toEqual({
      light: "price_light_y",
      standard: "price_standard_y",
      premium: "price_premium_y",
    });
  });

  it("全プランの年額Priceが揃っていれば isAnnualEnabled は true", () => {
    expect(isAnnualEnabled()).toBe(true);
  });

  it("isAnnualPriceId は年額Priceのみ true、月額/未知/null は false", () => {
    expect(isAnnualPriceId("price_standard_y")).toBe(true);
    expect(isAnnualPriceId("price_premium_y")).toBe(true);
    expect(isAnnualPriceId("price_standard_m")).toBe(false);
    expect(isAnnualPriceId("unknown")).toBe(false);
    expect(isAnnualPriceId(null)).toBe(false);
  });
});

describe("年額プラン: トライアル付与", () => {
  it("年額は全プランにトライアルを付与する（ライトも対象）", () => {
    expect(getTrialPeriodDaysForPlan("light", "year")).toBe(7);
    expect(getTrialPeriodDaysForPlan("standard", "year")).toBe(7);
    expect(getTrialPeriodDaysForPlan("premium", "year")).toBe(7);
  });

  it("月額はライトのみトライアル対象外", () => {
    expect(getTrialPeriodDaysForPlan("light", "month")).toBeUndefined();
    expect(getTrialPeriodDaysForPlan("standard", "month")).toBe(7);
    expect(getTrialPeriodDaysForPlan("premium", "month")).toBe(7);
  });
});

describe("年額プラン: 完了画面メッセージ", () => {
  it("年額は『年額…自動請求』を含み、ライトでもトライアル開始扱い", () => {
    const msg = getCompleteMessage("light", 7, DEFAULT_ANNUAL_PRICES.light, "year");
    expect(msg.title).toContain("7日間");
    expect(msg.body).toContain("年額");
    expect(msg.body).toContain("自動請求");
    expect(msg.body).toContain("¥29,800");
  });

  it("月額ライトは即時契約メッセージ（トライアルなし）", () => {
    const msg = getCompleteMessage("light", 7, DEFAULT_PLAN_PRICES.light, "month");
    expect(msg.body).toContain("月額");
    expect(msg.body).not.toContain("トライアル");
  });
});
