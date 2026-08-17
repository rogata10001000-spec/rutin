import { describe, expect, it, beforeAll, vi } from "vitest";
import type Stripe from "stripe";
import { createMockSupabase } from "../helpers/mock-supabase";

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  buildAuditMetadata: (a: unknown) => a,
}));

// 二重契約ガードの検証用に Stripe API 呼び出しだけ差し替える（他は実装のまま）
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    cancelStripeSubscription: vi.fn().mockResolvedValue(true),
  };
});

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

  it("既存ユーザーに別のライブ契約があれば、新しい契約を自動キャンセルして割当を上書きしない", async () => {
    const { cancelStripeSubscription } = await import("@/lib/stripe");
    vi.mocked(cancelStripeSubscription).mockClear();

    const calls: Array<{ table: string; op: string }> = [];
    let subscriptionsSelectCount = 0;

    const supabase = createMockSupabase(({ table, op }) => {
      calls.push({ table, op });

      if (table === "subscriptions" && op === "select") {
        subscriptionsSelectCount += 1;
        // 1回目: stripe_subscription_id での既存行検索 → 未登録（createdフォールバックへ）
        if (subscriptionsSelectCount === 1) return { data: null };
        // 2回目: 二重契約ガードのライブ契約検索 → 別のライブ契約が存在
        return {
          data: {
            id: "row_existing",
            stripe_subscription_id: "sub_existing",
            plan_code: "standard",
          },
        };
      }
      if (table === "end_users" && op === "select") {
        // 複数メイト対応で end_users は「人×メイト」の関係行になった。
        // UIDからの取得は配列を返す（実PostgRESTのキー形に追随させる）。
        return {
          data: [
            {
              id: "user_1",
              person_id: "person_1",
              line_user_id: "U".padEnd(33, "0"),
              assigned_cast_id: "cast_1",
              status: "active",
              plan_code: "standard",
              nickname: "テスト",
              line_profile_synced_at: null,
            },
          ],
        };
      }
      // 運営通知の宛先など、その他の読み取りは空でよい
      return { data: null };
    });

    const res = await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({
        id: "sub_duplicate",
        metadata: {
          line_user_id: "U".padEnd(33, "0"),
          cast_id: "cast_1",
          plan_code: "standard",
        },
      }),
      "customer.subscription.created",
      "evt_dup"
    );

    expect(res).toMatchObject({
      skipped: true,
      reason: "duplicate live subscription auto-canceled",
    });
    // 新しい方（重複）がキャンセルされる
    expect(cancelStripeSubscription).toHaveBeenCalledWith("sub_duplicate");
    // 既存契約の割当・状態は一切上書きされない／重複の行も挿入されない
    expect(calls).not.toContainEqual({ table: "end_users", op: "update" });
    expect(calls).not.toContainEqual({ table: "subscriptions", op: "insert" });
  });

  it("別メイトの追加契約は二重契約として扱わずキャンセルしない", async () => {
    // 複数メイト契約の中核。ここが壊れると「追加契約したのに即キャンセル＋返金対応」になる。
    const { cancelStripeSubscription } = await import("@/lib/stripe");
    vi.mocked(cancelStripeSubscription).mockClear();

    let subscriptionsSelectCount = 0;
    const calls: Array<{ table: string; op: string }> = [];

    const supabase = createMockSupabase(({ table, op }) => {
      calls.push({ table, op });

      if (table === "subscriptions" && op === "select") {
        subscriptionsSelectCount += 1;
        // 1回目: stripe_subscription_id での既存行検索 → 未登録
        // 2回目: 二重契約ガード → このメイト(cast_2)の関係行にはライブ契約なし
        return { data: null };
      }
      if (table === "end_users" && op === "select") {
        // 既存はメイト1との関係行のみ。メイト2の行は無い（＝これから作られる）
        return {
          data: [
            {
              id: "user_1",
              person_id: "person_1",
              line_user_id: "U".padEnd(33, "0"),
              assigned_cast_id: "cast_1",
              status: "active",
              plan_code: "standard",
              nickname: "テスト",
              line_profile_synced_at: null,
            },
          ],
        };
      }
      if (table === "end_users" && op === "insert") {
        return { data: { id: "user_2", person_id: "person_1" } };
      }
      return { data: null };
    });

    await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({
        id: "sub_second_mate",
        metadata: {
          line_user_id: "U".padEnd(33, "0"),
          cast_id: "cast_2",
          plan_code: "standard",
          person_id: "person_1",
        },
      }),
      "customer.subscription.created",
      "evt_add_mate"
    );

    // 追加契約はキャンセルしない
    expect(cancelStripeSubscription).not.toHaveBeenCalled();
    // メイト2用の関係行が作られ、契約行が入る
    expect(calls).toContainEqual({ table: "end_users", op: "insert" });
    expect(calls).toContainEqual({ table: "subscriptions", op: "insert" });
  });
});
