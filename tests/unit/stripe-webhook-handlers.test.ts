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

// 行の新規作成フォールバックが参照する「Stripeの現在状態」を差し替える。
// 既定は取得失敗（＝イベントペイロードで続行する経路）。
vi.mock("@/lib/stripe-subscription-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-subscription-sync")>();
  return {
    ...actual,
    fetchStripeSubscription: vi.fn().mockRejectedValue(new Error("no live fetch in test")),
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

  it("updated が最初に届いても（行なし・metadataあり）契約行を作成する（到着順の逆転対策）", async () => {
    // 実例（2026-08-20）: updated(active) が最初に届いて「行が無い」でスキップされ、
    // 後続イベントが支払い確定前の incomplete を保存 → active への遷移が永遠に
    // 反映されず、課金済みの会員が未契約扱いのまま取り残された。
    const calls: Array<{ table: string; op: string }> = [];

    const supabase = createMockSupabase(({ table, op }) => {
      calls.push({ table, op });
      if (table === "subscriptions" && op === "select") {
        return { data: null }; // 行はまだ無い
      }
      if (table === "end_users" && op === "select") {
        return {
          data: [
            {
              id: "user_1",
              person_id: "person_1",
              line_user_id: "U".padEnd(33, "0"),
              assigned_cast_id: "cast_1",
              status: "incomplete",
              plan_code: "light",
              nickname: "テスト",
              line_profile_synced_at: null,
            },
          ],
        };
      }
      return { data: null };
    });

    const res = await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({
        id: "sub_first_event_updated",
        status: "active",
        metadata: {
          line_user_id: "U".padEnd(33, "0"),
          cast_id: "cast_1",
          plan_code: "light",
        },
      }),
      "customer.subscription.updated",
      "evt_order_flip"
    );

    // スキップせず行が作られること（従来は created 以外を弾いていた）
    expect(res).not.toMatchObject({ skipped: true });
    expect(calls).toContainEqual({ table: "subscriptions", op: "insert" });
  });


  it("行の新規作成はイベントペイロードでなくStripeの現在状態を正とする（古いactiveの復活防止）", async () => {
    // updated(canceled) が「行なし」で捨てられた後、遅延した created(active) が
    // フォールバックで行を作るケース。ペイロードの active を信じると
    // Stripe上は解約済みなのにDBだけ active になる。現在状態(canceled)で作ること。
    const { fetchStripeSubscription } = await import("@/lib/stripe-subscription-sync");
    vi.mocked(fetchStripeSubscription).mockResolvedValueOnce({
      id: "sub_stale_created",
      status: "canceled",
      pause_collection: null,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_1" }, current_period_end: 1_700_000_000 }] },
    } as never);

    const inserts: Array<Record<string, unknown>> = [];
    const supabase = createMockSupabase(({ table, op, payload }) => {
      if (table === "subscriptions" && op === "select") return { data: null };
      if (table === "subscriptions" && op === "insert" && payload) {
        inserts.push(payload as Record<string, unknown>);
        return { data: null };
      }
      if (table === "end_users" && op === "select") {
        return {
          data: [
            {
              id: "user_1",
              person_id: "person_1",
              line_user_id: "U".padEnd(33, "0"),
              assigned_cast_id: "cast_1",
              status: "incomplete",
              plan_code: "light",
              nickname: "テスト",
              line_profile_synced_at: null,
            },
          ],
        };
      }
      return { data: null };
    });

    await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({
        id: "sub_stale_created",
        status: "active", // ← 古いペイロード
        metadata: {
          line_user_id: "U".padEnd(33, "0"),
          cast_id: "cast_1",
          plan_code: "light",
        },
      }),
      "customer.subscription.created",
      "evt_stale_payload"
    );

    const subInsert = inserts.find((i) => "stripe_subscription_id" in i);
    expect(subInsert?.status).toBe("canceled");
  });

  it("行が無く metadata も無い updated は従来どおりスキップ（外部作成サブスクを取り込まない）", async () => {
    const supabase = createMockSupabase(({ table }) => {
      if (table === "end_users") return { data: [] };
      return { data: null };
    });
    const res = await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({ id: "sub_no_meta", status: "active", metadata: {} }),
      "customer.subscription.updated",
      "evt_no_meta"
    );
    expect(res).toMatchObject({ skipped: true, reason: "missing subscription metadata" });
  });

  it("既存行への同期で incomplete への後退は書き込まない（支払い確定後の巻き戻し防止）", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const supabase = createMockSupabase(({ table, op, payload }) => {
      if (table === "subscriptions" && op === "select") {
        return {
          data: {
            id: "row_live",
            end_user_id: "user_1",
            status: "active",
            plan_code: "light",
            cancel_at_period_end: false,
            end_users: { assigned_cast_id: "cast_1" },
          },
        };
      }
      if (op === "update" && payload) updates.push(payload as Record<string, unknown>);
      return { data: null };
    });

    await mod.handleSubscriptionUpsert(
      supabase,
      makeSubscription({ id: "sub_live", status: "incomplete" }),
      "customer.subscription.updated",
      "evt_stale_incomplete"
    );

    // status キー自体が含まれない（incomplete で上書きしない）
    for (const u of updates) {
      expect(u.status).not.toBe("incomplete");
    }
  });
});

describe("subscriptionIdFromInvoice（invoice.paid の形の互換）", () => {
  // 直接exportされていないため、handleInvoicePaymentFailed 経由で間接検証する:
  // subscription を解決できれば「subscriptions 検索」へ進み、できなければ即スキップになる。
  it("新形（parent.subscription_details）の invoice からサブスクIDを解決できる", async () => {
    const calls: string[] = [];
    const supabase = createMockSupabase(({ table }) => {
      calls.push(table);
      return { data: null };
    });
    await mod.handleInvoicePaymentFailed(
      supabase,
      {
        id: "in_new_shape",
        parent: { subscription_details: { subscription: "sub_from_parent" } },
      } as unknown as import("stripe").Stripe.Invoice,
      "invoice.payment_failed"
    );
    // 解決できていれば subscriptions テーブルを検索しにいく
    expect(calls).toContain("subscriptions");
  });

  it("旧形（invoice.subscription）も引き続き解決できる", async () => {
    const calls: string[] = [];
    const supabase = createMockSupabase(({ table }) => {
      calls.push(table);
      return { data: null };
    });
    await mod.handleInvoicePaymentFailed(
      supabase,
      { id: "in_old_shape", subscription: "sub_legacy" } as unknown as import("stripe").Stripe.Invoice,
      "invoice.payment_failed"
    );
    expect(calls).toContain("subscriptions");
  });

  it("どちらの形にも無ければスキップ（外部作成の単発請求）", async () => {
    const supabase = createMockSupabase(() => ({ data: null }));
    const res = await mod.handleInvoicePaymentFailed(
      supabase,
      { id: "in_no_sub" } as unknown as import("stripe").Stripe.Invoice,
      "invoice.payment_failed"
    );
    expect(res).toMatchObject({ skipped: true });
  });
});
