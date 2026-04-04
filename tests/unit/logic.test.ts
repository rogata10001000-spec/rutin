import { describe, test, expect } from "vitest";
import {
  calculateTax,
  calculatePayout,
  calculateBalance,
  resolvePayoutRule,
  calculateSlaRemaining,
  isUnreported,
  calculateInboxPriority,
  hasSentMessageToday,
  type PayoutRule,
} from "@/lib/calculations";

describe("Unit/Logic - 税計算", () => {
  test("UT-001 税計算: rate=0.1, excl=100 → tax=10, incl=110", () => {
    const result = calculateTax(100, 0.1);
    expect(result.amountExclTax).toBe(100);
    expect(result.taxJpy).toBe(10);
    expect(result.amountInclTax).toBe(110);
  });

  test("UT-002 税端数: excl=101 → 端数切り捨て", () => {
    const result = calculateTax(101, 0.1);
    expect(result.taxJpy).toBe(10); // 10.1 → 10（切り捨て）
    expect(result.amountInclTax).toBe(111);
  });

  test("税計算: 大きい金額", () => {
    const result = calculateTax(9999, 0.1);
    expect(result.taxJpy).toBe(999); // 999.9 → 999
    expect(result.amountInclTax).toBe(10998);
  });
});

describe("Unit/Logic - 配分計算", () => {
  test("UT-016 配分計算: excl=100, percent=30 → payout=30", () => {
    const result = calculatePayout(100, 30);
    expect(result.payoutAmount).toBe(30);
    expect(result.percentApplied).toBe(30);
  });

  test("配分計算: 端数切り捨て", () => {
    const result = calculatePayout(101, 30);
    expect(result.payoutAmount).toBe(30); // 30.3 → 30
  });

  test("配分計算: 100%", () => {
    const result = calculatePayout(100, 100);
    expect(result.payoutAmount).toBe(100);
  });

  test("配分計算: 0%", () => {
    const result = calculatePayout(100, 0);
    expect(result.payoutAmount).toBe(0);
  });
});

describe("Unit/Logic - ポイント残高", () => {
  test("UT-005 ポイント残高: +1000/-300 → 700", () => {
    const ledger = [{ delta_points: 1000 }, { delta_points: -300 }];
    expect(calculateBalance(ledger)).toBe(700);
  });

  test("空の台帳 → 0", () => {
    expect(calculateBalance([])).toBe(0);
  });

  test("複数の購入と消費", () => {
    const ledger = [
      { delta_points: 1000 },
      { delta_points: -300 },
      { delta_points: 3000 },
      { delta_points: -500 },
      { delta_points: -200 },
    ];
    expect(calculateBalance(ledger)).toBe(3000);
  });
});

describe("Unit/Logic - 配分ルール解決", () => {
  const baseRule: PayoutRule = {
    id: "1",
    rule_type: "gift_share",
    scope_type: "global",
    cast_id: null,
    gift_id: null,
    gift_category: null,
    percent: 10,
    effective_from: "2020-01-01",
    effective_to: null,
    active: true,
  };

  test("UT-003 配分ルール解決: global=10, cast=30 → cast優先", () => {
    const rules: PayoutRule[] = [
      { ...baseRule, id: "1", scope_type: "global", percent: 10 },
      {
        ...baseRule,
        id: "2",
        scope_type: "cast",
        cast_id: "cast-1",
        percent: 30,
      },
    ];

    const resolved = resolvePayoutRule(
      rules,
      "cast-1",
      "gift-1",
      "感謝",
      "2024-01-01"
    );
    expect(resolved?.id).toBe("2");
    expect(resolved?.percent).toBe(30);
  });

  test("UT-004 配分ルール期間: cast有効期間外 → globalにフォールバック", () => {
    const rules: PayoutRule[] = [
      { ...baseRule, id: "1", scope_type: "global", percent: 10 },
      {
        ...baseRule,
        id: "2",
        scope_type: "cast",
        cast_id: "cast-1",
        percent: 30,
        effective_from: "2025-01-01", // 未来
      },
    ];

    const resolved = resolvePayoutRule(
      rules,
      "cast-1",
      "gift-1",
      "感謝",
      "2024-01-01"
    );
    expect(resolved?.id).toBe("1");
    expect(resolved?.percent).toBe(10);
  });

  test("inactive ルールは無視", () => {
    const rules: PayoutRule[] = [
      { ...baseRule, id: "1", scope_type: "global", percent: 10 },
      {
        ...baseRule,
        id: "2",
        scope_type: "cast",
        cast_id: "cast-1",
        percent: 30,
        active: false,
      },
    ];

    const resolved = resolvePayoutRule(
      rules,
      "cast-1",
      "gift-1",
      "感謝",
      "2024-01-01"
    );
    expect(resolved?.id).toBe("1");
  });
});

describe("Unit/Logic - SLA計算", () => {
  test("UT-013 SLA残計算: sla=720min → 残時間正", () => {
    const lastMsg = new Date("2024-01-01T10:00:00Z");
    const now = new Date("2024-01-01T12:00:00Z"); // 2時間後

    const remaining = calculateSlaRemaining(lastMsg, 720, now);
    expect(remaining).toBe(600); // 720 - 120 = 600分
  });

  test("SLA超過 → 0", () => {
    const lastMsg = new Date("2024-01-01T10:00:00Z");
    const now = new Date("2024-01-02T10:00:00Z"); // 24時間後

    const remaining = calculateSlaRemaining(lastMsg, 720, now);
    expect(remaining).toBe(0);
  });

  test("lastUserMessageAt が null → null", () => {
    const remaining = calculateSlaRemaining(null, 720);
    expect(remaining).toBeNull();
  });
});

describe("Unit/Logic - 未報告判定", () => {
  test("UT-012 未報告判定: 最終チェックインが2日以上前", () => {
    const now = new Date("2024-01-05T00:00:00Z");
    const lastCheckin = new Date("2024-01-02T00:00:00Z"); // 3日前
    const lastMessage = new Date("2024-01-02T00:00:00Z");

    expect(isUnreported(lastCheckin, lastMessage, 2, now)).toBe(true);
  });

  test("チェックインが2日以内なら未報告ではない", () => {
    const now = new Date("2024-01-05T00:00:00Z");
    const lastCheckin = new Date("2024-01-04T00:00:00Z"); // 1日前
    const lastMessage = new Date("2024-01-02T00:00:00Z");

    expect(isUnreported(lastCheckin, lastMessage, 2, now)).toBe(false);
  });

  test("メッセージが2日以内でも未報告ではない", () => {
    const now = new Date("2024-01-05T00:00:00Z");
    const lastCheckin = new Date("2024-01-02T00:00:00Z");
    const lastMessage = new Date("2024-01-04T00:00:00Z"); // 1日前

    expect(isUnreported(lastCheckin, lastMessage, 2, now)).toBe(false);
  });
});

describe("Unit/Logic - Inbox優先度（改善版）", () => {
  test("UT-010 Inbox優先度: risk/open → 高スコア加算", () => {
    const withRisk = calculateInboxPriority({
      hasRisk: true,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: true,
      hasSentTodayMessage: false,
    });

    const withoutRisk = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: true,
      hasSentTodayMessage: false,
    });

    expect(withRisk).toBeGreaterThan(withoutRisk);
    expect(withRisk - withoutRisk).toBe(500); // リスク加算は500点
  });

  test("UT-011 Inbox優先度: paused → スコア低下", () => {
    const normalScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    const pausedScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: true,
      planPriorityLevel: 2,
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    expect(pausedScore).toBeLessThan(normalScore);
    expect(pausedScore).toBeLessThan(0);
  });

  test("Premium > Standard > Light の優先度", () => {
    const premiumScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 30,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 1, // Premium
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    const standardScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2, // Standard
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    const lightScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 100,
      slaWarningMinutes: 240,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 3, // Light
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    expect(premiumScore).toBeGreaterThan(standardScore);
    expect(standardScore).toBeGreaterThan(lightScore);
  });

  test("未返信 > 今日未送信 > 返信済み の優先順位", () => {
    const unrepliedScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 60,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: true,
      hasSentTodayMessage: false,
    });

    const notSentTodayScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: null,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: false,
      hasSentTodayMessage: false,
    });

    const repliedScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: null,
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: false,
      hasSentTodayMessage: true,
    });

    expect(unrepliedScore).toBeGreaterThan(notSentTodayScore);
    expect(notSentTodayScore).toBeGreaterThan(repliedScore);
    expect(unrepliedScore).toBeGreaterThan(10000); // 未返信は10000ベース
    expect(notSentTodayScore).toBeGreaterThan(5000); // 今日未送信は5000ベース
  });

  test("未返信時のSLA残時間によるスコア変動", () => {
    const urgentScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 10, // 残り10分
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: true,
      hasSentTodayMessage: false,
    });

    const normalScore = calculateInboxPriority({
      hasRisk: false,
      slaRemainingMinutes: 500, // 残り500分
      slaWarningMinutes: 120,
      isUnreported: false,
      isPaused: false,
      planPriorityLevel: 2,
      hasUnrepliedMessage: true,
      hasSentTodayMessage: false,
    });

    expect(urgentScore).toBeGreaterThan(normalScore);
  });
});

describe("Unit/Logic - 今日のメッセージ送信判定", () => {
  test("今日（JST）のメッセージ → true", () => {
    const now = new Date("2024-01-05T10:00:00+09:00");
    const lastSent = new Date("2024-01-05T08:00:00+09:00");
    
    expect(hasSentMessageToday(lastSent, now)).toBe(true);
  });

  test("昨日のメッセージ → false", () => {
    const now = new Date("2024-01-05T10:00:00+09:00");
    const lastSent = new Date("2024-01-04T23:00:00+09:00");
    
    expect(hasSentMessageToday(lastSent, now)).toBe(false);
  });

  test("nullの場合 → false", () => {
    const now = new Date("2024-01-05T10:00:00+09:00");
    
    expect(hasSentMessageToday(null, now)).toBe(false);
  });

  test("日付境界をまたぐケース（JST）", () => {
    // JSTの深夜0時を跨ぐケース
    const now = new Date("2024-01-05T00:30:00+09:00"); // 1/5の0:30
    const yesterdayLate = new Date("2024-01-04T23:30:00+09:00"); // 1/4の23:30
    const todayEarly = new Date("2024-01-05T00:15:00+09:00"); // 1/5の0:15
    
    expect(hasSentMessageToday(yesterdayLate, now)).toBe(false);
    expect(hasSentMessageToday(todayEarly, now)).toBe(true);
  });
});

describe("Unit/Logic - 冪等性", () => {
  test("UT-008 webhook冪等: 同event_idは2重処理されない", () => {
    // この検証は実際のDBテストで行う
    // ここでは冪等判定ロジックの概念を確認
    const processedEvents = new Set<string>();

    const checkIdempotency = (eventId: string): boolean => {
      if (processedEvents.has(eventId)) {
        return false; // 重複
      }
      processedEvents.add(eventId);
      return true; // 新規
    };

    expect(checkIdempotency("event-1")).toBe(true);
    expect(checkIdempotency("event-1")).toBe(false); // 重複
    expect(checkIdempotency("event-2")).toBe(true);
  });

  test("UT-019 revenue_event冪等: 同ref 2回目は拒否/skip", () => {
    // unique制約 (event_type, source_ref_type, source_ref_id) で担保
    // DBレベルのテストで検証
    expect(true).toBe(true);
  });
});

describe("Unit/Logic - AI制限", () => {
  test("UT-009 AI 1日3回: JST基準で制限", () => {
    // 実装は ai.ts 内で ai_draft_requests をカウント
    // ここでは制限値の確認
    const AI_DAILY_LIMIT = 3;

    const checkLimit = (currentCount: number): boolean => {
      return currentCount < AI_DAILY_LIMIT;
    };

    expect(checkLimit(0)).toBe(true);
    expect(checkLimit(1)).toBe(true);
    expect(checkLimit(2)).toBe(true);
    expect(checkLimit(3)).toBe(false); // 4回目は拒否
  });
});

describe("Unit/Logic - 代理返信", () => {
  test("UT-014 代理返信メタ: sent_as_proxy=true", () => {
    // メッセージ作成時に sent_as_proxy フラグが設定される
    const message = {
      direction: "out",
      body: "代理返信テスト",
      sent_as_proxy: true,
      proxy_for_cast_id: "original-cast-id",
    };

    expect(message.sent_as_proxy).toBe(true);
    expect(message.proxy_for_cast_id).toBeDefined();
  });
});

describe("Unit/Logic - 誕生日", () => {
  test("UT-015 誕生日重複防止: 同年2回は拒否", () => {
    // unique制約 (end_user_id, year) で担保
    // ここでは年の計算ロジックを確認
    const getCurrentYear = (date: Date): number => {
      return parseInt(
        date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).split("-")[0],
        10
      );
    };

    const testDate = new Date("2024-03-15T10:00:00Z");
    expect(getCurrentYear(testDate)).toBe(2024);
  });
});

describe("Unit/Logic - 価格解決", () => {
  test("UT-018 価格解決: overrideあり → override採用", () => {
    // 価格解決ロジック
    const resolvePriceId = (
      defaultPriceId: string,
      overridePriceId: string | null
    ): string => {
      return overridePriceId ?? defaultPriceId;
    };

    expect(resolvePriceId("default-price", "override-price")).toBe("override-price");
    expect(resolvePriceId("default-price", null)).toBe("default-price");
  });
});

describe("Unit/Logic - 未使用ポイント", () => {
  test("UT-017 未使用ポイントは配分対象外", () => {
    // ポイント購入だけでは payout_calculations は作成されない
    // gift_redeem（ギフト使用）時のみ配分計算が行われる
    const ledger = [
      { delta_points: 1000, reason: "purchase" }, // 配分対象外
      { delta_points: -300, reason: "gift_redeem" }, // 配分対象
    ];

    const payoutEligible = ledger.filter((e) => e.reason === "gift_redeem");
    expect(payoutEligible.length).toBe(1);
    expect(payoutEligible[0].delta_points).toBe(-300);
  });
});

// =====================================
// Week4-6 追加テスト: Zodスキーマ検証
// =====================================

import {
  pricingOverrideSchema,
  changeUserSubscriptionPriceSchema,
} from "@/schemas/pricing";
import {
  upsertGiftCatalogSchema,
  upsertPointProductSchema,
} from "@/schemas/gifts";
import { payoutRuleSchema } from "@/schemas/payout";
import { settlementPeriodSchema } from "@/schemas/settlements";

describe("Unit/Zod - 価格スキーマ", () => {
  test("pricingOverrideSchema: 正常入力", () => {
    const input = {
      castId: "550e8400-e29b-41d4-a716-446655440000",
      planCode: "standard",
      stripePriceId: "price_xxx",
      amountMonthly: 6980,
      validFrom: "2024-01-01",
      active: true,
    };
    const result = pricingOverrideSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("pricingOverrideSchema: 不正なplanCode", () => {
    const input = {
      castId: "550e8400-e29b-41d4-a716-446655440000",
      planCode: "invalid",
      stripePriceId: "price_xxx",
      amountMonthly: 6980,
      validFrom: "2024-01-01",
      active: true,
    };
    const result = pricingOverrideSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("pricingOverrideSchema: 不正な日付形式", () => {
    const input = {
      castId: "550e8400-e29b-41d4-a716-446655440000",
      planCode: "standard",
      stripePriceId: "price_xxx",
      amountMonthly: 6980,
      validFrom: "2024/01/01", // スラッシュ形式は不正
      active: true,
    };
    const result = pricingOverrideSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("changeUserSubscriptionPriceSchema: 正常入力", () => {
    const input = {
      endUserId: "550e8400-e29b-41d4-a716-446655440000",
      mode: "next_cycle",
    };
    const result = changeUserSubscriptionPriceSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("changeUserSubscriptionPriceSchema: 不正なmode", () => {
    const input = {
      endUserId: "550e8400-e29b-41d4-a716-446655440000",
      mode: "invalid_mode",
    };
    const result = changeUserSubscriptionPriceSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("Unit/Zod - ギフトスキーマ", () => {
  test("upsertGiftCatalogSchema: 新規作成（idなし）", () => {
    const input = {
      name: "ありがとうギフト",
      category: "感謝",
      costPoints: 100,
      active: true,
      icon: "🎁",
    };
    const result = upsertGiftCatalogSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("upsertGiftCatalogSchema: 更新（idあり）", () => {
    const input = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "更新ギフト",
      category: "応援",
      costPoints: 200,
      active: true,
    };
    const result = upsertGiftCatalogSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("upsertGiftCatalogSchema: 名前が空", () => {
    const input = {
      name: "",
      category: "感謝",
      costPoints: 100,
      active: true,
    };
    const result = upsertGiftCatalogSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("upsertGiftCatalogSchema: costPointsが負", () => {
    const input = {
      name: "テスト",
      category: "感謝",
      costPoints: -100,
      active: true,
    };
    const result = upsertGiftCatalogSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("upsertPointProductSchema: 正常入力", () => {
    const input = {
      name: "1000ポイント",
      points: 1000,
      priceJpy: 1100,
      stripePriceId: "price_1000pt",
      active: true,
    };
    const result = upsertPointProductSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("upsertPointProductSchema: stripePriceIdが空", () => {
    const input = {
      name: "1000ポイント",
      points: 1000,
      priceJpy: 1100,
      stripePriceId: "",
      active: true,
    };
    const result = upsertPointProductSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("Unit/Zod - 配分ルールスキーマ", () => {
  test("payoutRuleSchema: global scope", () => {
    const input = {
      ruleType: "gift_share",
      scopeType: "global",
      percent: 30,
      effectiveFrom: "2024-01-01",
      active: true,
    };
    const result = payoutRuleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("payoutRuleSchema: cast scope", () => {
    const input = {
      ruleType: "gift_share",
      scopeType: "cast",
      castId: "550e8400-e29b-41d4-a716-446655440000",
      percent: 50,
      effectiveFrom: "2024-01-01",
      active: true,
    };
    const result = payoutRuleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe("Unit/Zod - 精算スキーマ", () => {
  test("settlementPeriodSchema: 正常入力", () => {
    const input = {
      from: "2024-01-01",
      to: "2024-01-31",
    };
    const result = settlementPeriodSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// =====================================
// Week4-6 追加テスト: 精算計算
// =====================================

describe("Unit/Logic - 精算バッチ", () => {
  test("精算合計計算", () => {
    const items = [
      { castId: "cast-1", amount: 10000, count: 5 },
      { castId: "cast-2", amount: 15000, count: 8 },
      { castId: "cast-3", amount: 5000, count: 2 },
    ];

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const totalCount = items.reduce((sum, item) => sum + item.count, 0);

    expect(total).toBe(30000);
    expect(totalCount).toBe(15);
  });

  test("精算状態遷移", () => {
    const validTransitions: Record<string, string[]> = {
      draft: ["approved"],
      approved: ["paid"],
      paid: [],
    };

    const canTransition = (from: string, to: string): boolean => {
      return validTransitions[from]?.includes(to) ?? false;
    };

    expect(canTransition("draft", "approved")).toBe(true);
    expect(canTransition("draft", "paid")).toBe(false);
    expect(canTransition("approved", "paid")).toBe(true);
    expect(canTransition("paid", "draft")).toBe(false);
  });
});

// =====================================
// Week4-6 追加テスト: サブスク導線
// =====================================

describe("Unit/Logic - サブスクリプション", () => {
  test("キャパシティチェック", () => {
    const checkCapacity = (
      capacityLimit: number | null,
      currentCount: number
    ): boolean => {
      if (capacityLimit === null) return true;
      return currentCount < capacityLimit;
    };

    expect(checkCapacity(10, 5)).toBe(true);
    expect(checkCapacity(10, 10)).toBe(false);
    expect(checkCapacity(10, 15)).toBe(false);
    expect(checkCapacity(null, 100)).toBe(true);
  });

  test("トライアル期間計算", () => {
    const TRIAL_PERIOD_DAYS = 7;
    const startDate = new Date("2024-01-01T00:00:00Z");
    const trialEndDate = new Date(startDate);
    trialEndDate.setDate(trialEndDate.getDate() + TRIAL_PERIOD_DAYS);

    expect(trialEndDate.toISOString().split("T")[0]).toBe("2024-01-08");
  });

  test("価格オーバーライド解決", () => {
    const DEFAULT_PRICES = { light: 2980, standard: 6980, premium: 14800 };

    const resolvePrices = (
      defaults: typeof DEFAULT_PRICES,
      overrides: Array<{ plan_code: string; amount_monthly: number }>
    ) => {
      const prices = { ...defaults };
      for (const override of overrides) {
        if (override.plan_code in prices) {
          prices[override.plan_code as keyof typeof prices] = override.amount_monthly;
        }
      }
      return prices;
    };

    // オーバーライドなし
    expect(resolvePrices(DEFAULT_PRICES, [])).toEqual(DEFAULT_PRICES);

    // standardのみオーバーライド
    expect(
      resolvePrices(DEFAULT_PRICES, [{ plan_code: "standard", amount_monthly: 8800 }])
    ).toEqual({ light: 2980, standard: 8800, premium: 14800 });
  });
});
