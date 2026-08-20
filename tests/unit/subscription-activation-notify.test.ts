import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../helpers/mock-supabase";

/**
 * 契約成立時の案内送信が「1契約につき1回」であることの回帰テスト。
 *
 * checkout.session.completed と customer.subscription.created は同じ契約について
 * 両方届く（順序・欠落は保証されない）。イベント単位の冪等化ではイベントIDが
 * 違うため送信を止められず、実機で「ご契約ありがとうございます」が2通届いた。
 * 送信系は業務キー（stripe_subscription_id）の claim-first で1回に制限する。
 */

vi.mock("@/lib/line", () => ({
  pushTextMessage: vi.fn().mockResolvedValue(undefined),
  switchRichMenu: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/line-accounts", () => ({
  getDefaultLineAccount: vi.fn().mockResolvedValue({
    id: "acc-default",
    castId: null,
    isDefault: true,
    name: "Rutin（共通）",
    credentials: { accessToken: "t", channelSecret: "s" },
    richMenuContractedId: null,
    richMenuUncontractedId: null,
    friendAddUrl: null,
  }),
  getLineAccountForCast: vi.fn().mockResolvedValue({
    id: "acc-yui",
    castId: "cast-yui",
    isDefault: false,
    name: "ゆい",
    credentials: { accessToken: "t2", channelSecret: "s2" },
    friendAddUrl: "https://lin.ee/example",
  }),
}));

vi.mock("@/lib/push-notifications", () => ({
  sendPushToStaff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/operator-notifications", () => ({
  notifyOperatorsOfNewMember: vi.fn().mockResolvedValue(undefined),
}));

import { syncNewSubscriptionSideEffects } from "@/lib/stripe-subscription-sync";
import { pushTextMessage } from "@/lib/line";
import { sendPushToStaff } from "@/lib/push-notifications";
import { notifyOperatorsOfNewMember } from "@/lib/operator-notifications";

function buildSupabase() {
  let notifyClaims = 0;
  const supabase = createMockSupabase(({ table, op }) => {
    if (table === "webhook_events" && op === "insert") {
      notifyClaims += 1;
      // 1回目=確保成功 / 2回目以降=UNIQUE違反（もう片方のイベントが確保済み）
      return notifyClaims === 1
        ? { data: { id: "claim-1" } }
        : { error: { code: "23505", message: "duplicate key" } };
    }
    if (table === "staff_profiles") return { data: { display_name: "ゆい" } };
    if (table === "end_users" && op === "select") {
      return { data: { nickname: "テスト", line_display_name: "テスト" } };
    }
    return { data: null };
  });
  return supabase;
}

const params = {
  endUserId: "user-1",
  lineUserId: "U".padEnd(33, "0"),
  castId: "cast-yui",
  stripeSubscriptionId: "sub_test_once",
  planCode: "standard",
  status: "active",
  trialEndAt: null,
};

describe("契約成立時の案内送信の1回制御", () => {
  beforeEach(() => {
    vi.mocked(pushTextMessage).mockClear();
    vi.mocked(sendPushToStaff).mockClear();
    vi.mocked(notifyOperatorsOfNewMember).mockClear();
  });

  it("2つのwebhookイベントから2回呼ばれても、案内pushと担当通知は1回だけ", async () => {
    const supabase = buildSupabase();

    // checkout.session.completed → customer.subscription.created の順で同じ契約を処理
    await syncNewSubscriptionSideEffects(supabase, params);
    await syncNewSubscriptionSideEffects(supabase, params);

    expect(vi.mocked(pushTextMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPushToStaff)).toHaveBeenCalledTimes(1);
    // 運営向け新規会員通知も同じclaimの中＝イベント到着順に依存せず確実に1回
    expect(vi.mocked(notifyOperatorsOfNewMember)).toHaveBeenCalledTimes(1);
  });

  it("claimがDB障害で失敗したら送らない側に倒す（二重送信の害 > 送信漏れの害）", async () => {
    const supabase = createMockSupabase(({ table, op }) => {
      if (table === "webhook_events" && op === "insert") {
        return { error: { code: "XX000", message: "db down" } };
      }
      return { data: null };
    });

    await syncNewSubscriptionSideEffects(supabase, params);
    expect(vi.mocked(pushTextMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(sendPushToStaff)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyOperatorsOfNewMember)).not.toHaveBeenCalled();
  });
});
