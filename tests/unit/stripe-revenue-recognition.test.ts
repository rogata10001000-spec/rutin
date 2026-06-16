import { describe, expect, it, beforeAll, vi } from "vitest";
import type Stripe from "stripe";
import { createMockSupabase, type MockResult } from "../helpers/mock-supabase";

// 監査ログ等の副作用はモック（DB非依存でビジネスロジックのみ検証）
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  buildAuditMetadata: (a: unknown) => a,
}));

// 売上認識ロジックは route.ts からエクスポートされている。
// route.ts のトップレベル import が getServerEnv() を呼ぶため、先に環境変数を用意してから動的 import する。
type RecognizeFn = typeof import("@/app/api/webhooks/stripe/route").recognizeSubscriptionRevenue;
let recognizeSubscriptionRevenue: RecognizeFn;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.LINE_CHANNEL_SECRET = "line-secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
  process.env.LINE_USER_TOKEN_SECRET = "x".repeat(32);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

  ({ recognizeSubscriptionRevenue } = await import("@/app/api/webhooks/stripe/route"));
});

function invoice(overrides: Partial<Stripe.Invoice> & { subscription?: string }) {
  return {
    id: "in_test",
    amount_paid: 6980,
    created: 1_700_000_000,
    subscription: "sub_test",
    ...overrides,
  } as unknown as Stripe.Invoice;
}

describe("recognizeSubscriptionRevenue", () => {
  it("invoiceにsubscriptionが無ければスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await recognizeSubscriptionRevenue(supabase, invoice({ subscription: undefined }));
    expect(res).toMatchObject({ skipped: true });
  });

  it("金額0（トライアル開始等）はスキップ", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await recognizeSubscriptionRevenue(supabase, invoice({ amount_paid: 0 }));
    expect(res).toMatchObject({ skipped: true, reason: "invoice amount is zero" });
  });

  it("subscription未登録はスキップ", async () => {
    const supabase = createMockSupabase(({ table }) =>
      table === "subscriptions" ? { data: null } : { data: null }
    );
    const res = await recognizeSubscriptionRevenue(supabase, invoice({}));
    expect(res).toMatchObject({ skipped: true, reason: "subscription not found in database" });
  });

  it("担当キャスト未設定はスキップ", async () => {
    const supabase = createMockSupabase(({ table }) => {
      if (table === "subscriptions") {
        return {
          data: {
            id: "s1",
            end_user_id: "u1",
            plan_code: "standard",
            end_users: { assigned_cast_id: null },
          },
        };
      }
      return { data: null };
    });
    const res = await recognizeSubscriptionRevenue(supabase, invoice({}));
    expect(res).toMatchObject({ skipped: true, reason: "assigned cast not set" });
  });

  it("有効な税率が無ければスキップ", async () => {
    const supabase = createMockSupabase(({ table }) => {
      if (table === "subscriptions") {
        return {
          data: {
            id: "s1",
            end_user_id: "u1",
            plan_code: "standard",
            end_users: { assigned_cast_id: "c1" },
          },
        };
      }
      if (table === "tax_rates") return { data: null, error: { message: "no tax" } };
      return { data: null };
    });
    const res = await recognizeSubscriptionRevenue(supabase, invoice({}));
    expect(res).toMatchObject({ skipped: true, reason: "active tax rate not found" });
  });

  it("配分ルールが無ければスキップ", async () => {
    const supabase = createMockSupabase(({ table, op }) => {
      if (table === "subscriptions") {
        return {
          data: {
            id: "s1",
            end_user_id: "u1",
            plan_code: "standard",
            end_users: { assigned_cast_id: "c1" },
          },
        };
      }
      if (table === "tax_rates") return { data: { id: "t1", rate: 0.1 } };
      if (table === "revenue_events" && op === "insert") return { data: { id: "re1" }, error: null };
      if (table === "payout_rules") return { data: null };
      return { data: null };
    });
    const res = await recognizeSubscriptionRevenue(supabase, invoice({}));
    expect(res).toMatchObject({ skipped: true, reason: "payout rule not found" });
  });

  it("成功時は税抜・配分額を正しく計算して返す", async () => {
    const supabase = createMockSupabase(({ table, op }) => {
      if (table === "subscriptions") {
        return {
          data: {
            id: "s1",
            end_user_id: "u1",
            plan_code: "standard",
            end_users: { assigned_cast_id: "c1" },
          },
        };
      }
      if (table === "tax_rates") return { data: { id: "t1", rate: 0.1 } };
      if (table === "revenue_events" && op === "insert") return { data: { id: "re1" }, error: null };
      if (table === "payout_rules") return { data: { id: "pr1", percent: 50 } };
      if (table === "payout_calculations") return { error: null };
      return { data: null };
    });

    const res = (await recognizeSubscriptionRevenue(supabase, invoice({ amount_paid: 6980 }))) as {
      revenueEventId: string;
      payoutAmount: number;
    };

    // 税抜 = floor(6980 / 1.1) = 6345、配分 = floor(6345 * 50 / 100) = 3172
    expect(res.revenueEventId).toBe("re1");
    expect(res.payoutAmount).toBe(3172);
  });
});
