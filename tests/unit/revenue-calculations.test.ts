import { describe, test, expect } from "vitest";
import { aggregateRevenueSummary } from "@/lib/revenue-calculations";

describe("Unit/Revenue - 売上集計", () => {
  test("システム全体・メイト配分・本部取り分を正しく集計する", () => {
    const events = [
      {
        id: "rev-1",
        eventType: "subscription_monthly",
        castId: "cast-a",
        amountExclTaxJpy: 10000,
        amountInclTaxJpy: 11000,
      },
      {
        id: "rev-2",
        eventType: "gift_redeem",
        castId: "cast-a",
        amountExclTaxJpy: 5000,
        amountInclTaxJpy: 5500,
      },
      {
        id: "rev-3",
        eventType: "subscription_monthly",
        castId: "cast-b",
        amountExclTaxJpy: 8000,
        amountInclTaxJpy: 8800,
      },
    ];

    const payouts = [
      { revenueEventId: "rev-1", castId: "cast-a", amountJpy: 3000 },
      { revenueEventId: "rev-2", castId: "cast-a", amountJpy: 1500 },
      { revenueEventId: "rev-3", castId: "cast-b", amountJpy: 2400 },
    ];

    const result = aggregateRevenueSummary(events, payouts, {
      "cast-a": "メイトA",
      "cast-b": "メイトB",
    });

    expect(result.totalInclTaxJpy).toBe(25300);
    expect(result.totalExclTaxJpy).toBe(23000);
    expect(result.matePayoutTotalJpy).toBe(6900);
    expect(result.headquartersNetJpy).toBe(16100);
    expect(result.breakdown.subscriptionInclTaxJpy).toBe(19800);
    expect(result.breakdown.giftInclTaxJpy).toBe(5500);
    expect(result.breakdown.subscriptionCount).toBe(2);
    expect(result.breakdown.giftCount).toBe(1);
    expect(result.mateRows).toHaveLength(2);
    expect(result.mateRows[0].castName).toBe("メイトA");
    expect(result.mateRows[0].payoutAmountJpy).toBe(4500);
    expect(result.mateRows[0].subscriptionCount).toBe(1);
    expect(result.mateRows[0].giftCount).toBe(1);
  });

  test("配分のない売上は本部100%になる", () => {
    const events = [
      {
        id: "rev-1",
        eventType: "subscription_monthly",
        castId: null,
        amountExclTaxJpy: 10000,
        amountInclTaxJpy: 11000,
      },
    ];

    const result = aggregateRevenueSummary(events, [], {});

    expect(result.matePayoutTotalJpy).toBe(0);
    expect(result.headquartersNetJpy).toBe(10000);
  });

  test("refund/chargeback は集計対象外", () => {
    const events = [
      {
        id: "rev-1",
        eventType: "subscription_monthly",
        castId: "cast-a",
        amountExclTaxJpy: 10000,
        amountInclTaxJpy: 11000,
      },
      {
        id: "rev-2",
        eventType: "refund",
        castId: "cast-a",
        amountExclTaxJpy: -5000,
        amountInclTaxJpy: -5500,
      },
    ];

    const result = aggregateRevenueSummary(
      events,
      [{ revenueEventId: "rev-1", castId: "cast-a", amountJpy: 3000 }],
      { "cast-a": "メイトA" }
    );

    expect(result.totalInclTaxJpy).toBe(11000);
    expect(result.totalExclTaxJpy).toBe(10000);
    expect(result.headquartersNetJpy).toBe(7000);
  });
});
