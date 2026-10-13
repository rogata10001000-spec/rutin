import { describe, expect, it } from "vitest";
import {
  aiAdoption,
  cancelReasonBreakdown,
  estimateGrossMargin,
  firstReportRate,
  median,
  monthlyChurn,
  reportDaysPerWeek,
  resolvePayoutPercent,
  retention30d,
  staffWorkload,
  trialConversion,
} from "@/lib/kpi-calculations";
import { evaluateKpi, formatKpiValue, KPI_TARGET_BY_KEY, KPI_COST_ASSUMPTIONS } from "@/lib/kpi-targets";

const NOW = new Date("2026-10-14T03:00:00Z"); // JST 12:00
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("trialConversion", () => {
  it("終了済みトライアルだけを分母にし、転換済みは終了前でも数える", () => {
    const r = trialConversion(
      [
        // 終了済み・転換（subscribed_at あり）
        { trialStartedAt: daysAgo(20), trialEndAt: daysAgo(13), subscribedAt: daysAgo(13), status: "active" },
        // 終了済み・未転換
        { trialStartedAt: daysAgo(20), trialEndAt: daysAgo(13), subscribedAt: null, status: "canceled" },
        // トライアル中（終了前・未転換）→ 分母に入れない
        { trialStartedAt: daysAgo(2), trialEndAt: daysAgo(-5), subscribedAt: null, status: "trial" },
        // 終了前だが既に有料（年額即時契約など）→ 転換として数える
        { trialStartedAt: daysAgo(2), trialEndAt: daysAgo(-5), subscribedAt: daysAgo(1), status: "active" },
        // 窓の外（90日前）→ 除外
        { trialStartedAt: daysAgo(90), trialEndAt: daysAgo(83), subscribedAt: null, status: "canceled" },
      ],
      NOW
    );
    expect(r.total).toBe(3);
    expect(r.converted).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
  });
});

describe("retention30d", () => {
  it("30〜60日前に開始した人だけを母集団にし、30日以内の解約を離脱と数える", () => {
    const r = retention30d(
      [
        { subscribedAt: daysAgo(45), canceledAt: null }, // 継続
        { subscribedAt: daysAgo(45), canceledAt: daysAgo(20) }, // 25日目に解約 → 離脱
        { subscribedAt: daysAgo(45), canceledAt: daysAgo(5) }, // 40日目に解約 → 30日時点は継続
        { subscribedAt: daysAgo(10), canceledAt: null }, // まだ30日経っていない → 除外
        { subscribedAt: daysAgo(70), canceledAt: null }, // 窓の外 → 除外
      ],
      NOW
    );
    expect(r.total).toBe(3);
    expect(r.retained).toBe(2);
  });
});

describe("monthlyChurn / median", () => {
  it("分母0はnull", () => {
    expect(monthlyChurn(3, 0)).toBeNull();
    expect(monthlyChurn(3, 30)).toBeCloseTo(0.1);
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("resolvePayoutPercent", () => {
  const rules = [
    { scope_type: "global" as const, cast_id: null, plan_code: null, percent: 70, effective_from: "2026-01-01", effective_to: null },
    { scope_type: "cast" as const, cast_id: "C1", plan_code: null, percent: 60, effective_from: "2026-06-01", effective_to: null },
    { scope_type: "cast_plan" as const, cast_id: "C1", plan_code: "premium", percent: 50, effective_from: "2026-06-01", effective_to: null },
    { scope_type: "cast" as const, cast_id: "C2", plan_code: null, percent: 65, effective_from: "2026-06-01", effective_to: "2026-09-30" },
  ];
  it("cast_plan > cast > global の順で解決し、期限切れは無視、運営担当は0%", () => {
    expect(resolvePayoutPercent(rules, "C1", "premium", "2026-10-14", false)).toBe(50);
    expect(resolvePayoutPercent(rules, "C1", "standard", "2026-10-14", false)).toBe(60);
    expect(resolvePayoutPercent(rules, "C2", "standard", "2026-10-14", false)).toBe(70); // 失効 → global
    expect(resolvePayoutPercent(rules, "C9", "standard", "2026-10-14", false)).toBe(70);
    expect(resolvePayoutPercent(rules, "C1", "premium", "2026-10-14", true)).toBe(0);
    expect(resolvePayoutPercent([], "C1", "standard", "2026-10-14", false)).toBe(0);
  });
});

describe("estimateGrossMargin", () => {
  it("税抜MRRから配分・決済・LINEを引く（要件§0の試算と同じ桁）", () => {
    // 自分130人×6,800 + メイト180人×6,000（60%配分）
    const mrr = 130 * 6800 + 180 * 6000;
    const payout = Math.round((180 * 6000) / 1.1 * 0.6);
    const r = estimateGrossMargin({
      mrrInclTaxJpy: mrr,
      payoutJpy: payout,
      payingCount: 310,
      assumptions: KPI_COST_ASSUMPTIONS,
    });
    expect(r.mrrExclTaxJpy).toBe(Math.round(mrr / 1.1));
    expect(r.lineCostJpy).toBe(310 * 30 * 3);
    expect(r.grossMarginJpy).toBeGreaterThan(1_000_000);
    expect(r.grossMarginJpy).toBeLessThan(1_300_000);
  });
});

describe("aiAdoption", () => {
  it("成功リクエストを分母に、採用と「そのまま/編集」を分ける", () => {
    const r = aiAdoption(
      [
        { id: "r1", success: true },
        { id: "r2", success: true },
        { id: "r3", success: true },
        { id: "r4", success: false },
      ],
      [
        { requestId: "r1", selectedAt: daysAgo(1), body: "こんにちは", sentBody: "こんにちは" },
        { requestId: "r1", selectedAt: null, body: "別案", sentBody: null },
        { requestId: "r2", selectedAt: daysAgo(1), body: "お疲れさま", sentBody: "お疲れさまです！" },
        { requestId: "r3", selectedAt: null, body: "未採用", sentBody: null },
        { requestId: "r4", selectedAt: daysAgo(1), body: "失敗分", sentBody: "失敗分" },
      ]
    );
    expect(r.requests).toBe(3);
    expect(r.adopted).toBe(2);
    expect(r.unedited).toBe(1);
    expect(r.edited).toBe(1);
    expect(r.rate).toBeCloseTo(2 / 3);
  });
});

describe("staffWorkload", () => {
  it("担当者別に件数/日・中央値・時間/日を出し、未計測は除外する", () => {
    const rows = staffWorkload(
      [
        { staffId: "S1", createdAt: daysAgo(1), handlingSeconds: 60 },
        { staffId: "S1", createdAt: daysAgo(2), handlingSeconds: 120 },
        { staffId: "S1", createdAt: daysAgo(3), handlingSeconds: null },
        { staffId: "S2", createdAt: daysAgo(1), handlingSeconds: 30 },
        { staffId: null, createdAt: daysAgo(1), handlingSeconds: 10 },
      ],
      7
    );
    const s1 = rows.find((r) => r.staffId === "S1")!;
    expect(s1.replies).toBe(3);
    expect(s1.repliesPerDay).toBeCloseTo(3 / 7);
    expect(s1.handlingSamples).toBe(2);
    expect(s1.handlingMedianSeconds).toBe(90);
    expect(s1.handlingHoursPerDay).toBeCloseTo(180 / 7 / 3600);
    expect(rows.find((r) => r.staffId === "S2")!.handlingMedianSeconds).toBe(30);
    expect(rows).toHaveLength(2);
  });
});

describe("reportDaysPerWeek / firstReportRate", () => {
  it("JST日付の重複を1日に畳み、利用者平均を出す", () => {
    const r = reportDaysPerWeek(
      [
        { endUserId: "U1", occurredAt: "2026-10-13T14:00:00Z" }, // JST 10/13 23:00
        { endUserId: "U1", occurredAt: "2026-10-13T16:00:00Z" }, // JST 10/14 01:00 → 別日
        { endUserId: "U1", occurredAt: "2026-10-13T15:30:00Z" }, // JST 10/14 00:30 → 同日
        { endUserId: "U2", occurredAt: "2026-09-01T00:00:00Z" }, // 窓の外
      ],
      ["U1", "U2"],
      NOW
    );
    expect(r.average).toBe(1); // (2 + 0) / 2
  });
  it("72時間以内の初回報告を数え、期限が来ていない未報告は分母に入れない", () => {
    const r = firstReportRate(
      [
        { endUserId: "A", trialStartedAt: daysAgo(10) },
        { endUserId: "B", trialStartedAt: daysAgo(10) },
        { endUserId: "C", trialStartedAt: daysAgo(1) },
        { endUserId: "D", trialStartedAt: daysAgo(1) },
      ],
      [
        { endUserId: "A", occurredAt: daysAgo(9) }, // 24h後 → 報告
        { endUserId: "B", occurredAt: daysAgo(5) }, // 5日後 → 遅い
        { endUserId: "D", occurredAt: daysAgo(0.5) }, // 12h後 → 報告（期限前でも確定）
      ],
      NOW
    );
    expect(r.total).toBe(3); // A, B, D（C は期限前・未報告）
    expect(r.reported).toBe(2);
  });
});

describe("evaluateKpi / format", () => {
  it("目標・方向・最小標本で状態を判定する", () => {
    const churn = KPI_TARGET_BY_KEY.monthly_churn;
    expect(evaluateKpi(churn, 0.05, 50)).toBe("achieved");
    expect(evaluateKpi(churn, 0.09, 50)).toBe("warn");
    expect(evaluateKpi(churn, 0.2, 50)).toBe("bad");
    expect(evaluateKpi(churn, 0.2, 3)).toBe("insufficient");
    expect(evaluateKpi(churn, null, 50)).toBe("insufficient");
    const conv = KPI_TARGET_BY_KEY.trial_conversion;
    expect(evaluateKpi(conv, 0.35, 20)).toBe("achieved");
    expect(evaluateKpi(conv, 0.26, 20)).toBe("warn");
    expect(evaluateKpi(conv, 0.1, 20)).toBe("bad");
    expect(evaluateKpi(KPI_TARGET_BY_KEY.mrr, 1000)).toBe("none");
    expect(formatKpiValue("percent", 0.2857)).toBe("28.6%");
    expect(formatKpiValue("seconds", 75)).toBe("75秒");
    expect(formatKpiValue("seconds", 150)).toBe("2.5分");
    expect(formatKpiValue("jpy", null)).toBe("—");
  });
  it("解約理由は多い順・未指定は unspecified", () => {
    expect(cancelReasonBreakdown(["price", null, "price", "", "time"])).toEqual([
      { code: "price", count: 2 },
      { code: "unspecified", count: 2 },
      { code: "time", count: 1 },
    ]);
  });
});
