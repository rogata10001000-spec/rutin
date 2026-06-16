import { describe, expect, it, beforeAll, vi } from "vitest";
import type Stripe from "stripe";
import { createMockSupabase } from "../helpers/mock-supabase";

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  buildAuditMetadata: (a: unknown) => a,
}));

type Mod = typeof import("@/app/api/webhooks/stripe/route");
let mod: Mod;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.LINE_CHANNEL_SECRET = "line-secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
  process.env.LINE_USER_TOKEN_SECRET = "x".repeat(32);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
  mod = await import("@/app/api/webhooks/stripe/route");
});

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    created: 1_700_000_000,
    pause_collection: null,
    cancel_at_period_end: false,
    customer: "cus_1",
    metadata: {},
    items: { data: [{ price: { id: "price_1" } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("handleChargeRefunded", () => {
  it("MVP対象外としてスキップ", () => {
    const res = mod.handleChargeRefunded({ metadata: { type: "point" } } as unknown as Stripe.Charge);
    expect(res).toMatchObject({ skipped: true });
    expect(res.reason).toContain("point");
  });
});

describe("handleInvoicePaymentFailed", () => {
  it("subscription無しのinvoiceはスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleInvoicePaymentFailed(
      supabase,
      { id: "in_1", subscription: undefined } as unknown as Stripe.Invoice,
      "invoice.payment_failed"
    );
    expect(res).toMatchObject({ skipped: true });
  });

  it("subscription行が無ければスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleInvoicePaymentFailed(
      supabase,
      { id: "in_1", subscription: "sub_1" } as unknown as Stripe.Invoice,
      "invoice.payment_failed"
    );
    expect(res).toMatchObject({ skipped: true });
  });
});

describe("handleSubscriptionDeleted", () => {
  it("subscription行が無ければスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleSubscriptionDeleted(
      supabase,
      makeSubscription(),
      "customer.subscription.deleted",
      "evt_1"
    );
    expect(res).toMatchObject({ skipped: true });
  });
});

describe("handleSubscriptionUpsert", () => {
  it("updatedでsubscription未登録ならスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription(),
      "customer.subscription.updated",
      "evt_1"
    );
    expect(res).toMatchObject({ skipped: true });
  });

  it("createdでもメタデータ不足ならスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({ metadata: {} }),
      "customer.subscription.created",
      "evt_1"
    );
    expect(res).toMatchObject({ skipped: true, reason: "missing subscription metadata" });
  });
});
