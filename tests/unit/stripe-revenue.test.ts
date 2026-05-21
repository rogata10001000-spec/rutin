import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

/**
 * recognizeSubscriptionRevenue のスキップ条件をドキュメント化する軽量テスト。
 * 実 DB なしでビジネスルールのみ検証。
 */
describe("invoice.paid revenue recognition rules", () => {
  function shouldSkipRevenue(amountPaid: number): string | null {
    if (amountPaid <= 0) return "invoice amount is zero";
    return null;
  }

  it("skips zero amount invoices (trial start)", () => {
    expect(shouldSkipRevenue(0)).toBe("invoice amount is zero");
  });

  it("does not skip paid invoices", () => {
    expect(shouldSkipRevenue(6980)).toBeNull();
  });

  it("subscription id extraction from invoice", () => {
    const invoice = {
      subscription: "sub_123",
    } as unknown as Stripe.Invoice;
    const raw = invoice.subscription;
    const id = typeof raw === "string" ? raw : null;
    expect(id).toBe("sub_123");
  });
});
