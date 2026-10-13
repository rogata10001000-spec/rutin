import { describe, expect, it } from "vitest";
import { addDays, defaultReviewAt, formatGoalSummary, goalStage, validateGoalInput } from "@/lib/goal-defs";

describe("goal-defs", () => {
  it("入力検証: 種類・本文・週回数（全角は NFKC で畳む）", () => {
    expect(validateGoalInput({ category: "exercise", title: "  週３回　ジム  ", weeklyTarget: 3 })).toEqual({
      ok: true,
      category: "exercise",
      title: "週3回 ジム",
      weeklyTarget: 3,
    });
    expect(validateGoalInput({ category: "x", title: "a", weeklyTarget: null }).ok).toBe(false);
    expect(validateGoalInput({ category: "study", title: "   ", weeklyTarget: null }).ok).toBe(false);
    expect(validateGoalInput({ category: "study", title: "a".repeat(61), weeklyTarget: null }).ok).toBe(false);
    expect(validateGoalInput({ category: "study", title: "a", weeklyTarget: 8 }).ok).toBe(false);
    expect(validateGoalInput({ category: "study", title: "a", weeklyTarget: 0 }).ok).toBe(false);
  });
  it("振り返り日は90日後・ステージは30日刻み", () => {
    expect(defaultReviewAt("2026-10-14")).toBe("2027-01-12");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(goalStage("2026-10-14", "2026-10-14")).toMatchObject({ month: 1, days: 0 });
    expect(goalStage("2026-10-14", "2026-11-12")).toMatchObject({ month: 1, days: 29 });
    expect(goalStage("2026-10-14", "2026-11-13")).toMatchObject({ month: 2, days: 30 });
    expect(goalStage("2026-10-14", "2026-12-13")).toMatchObject({ month: 3 });
    expect(goalStage("2026-10-14", "2027-01-12")).toMatchObject({ month: 4, label: "次の目標を決める" });
  });
  it("要約は 種類・本文・週N回", () => {
    expect(formatGoalSummary({ category: "exercise", title: "ジムに行く", weeklyTarget: 3 })).toBe("運動・ジムに行く・週3回");
    expect(formatGoalSummary({ category: "other", title: "早起き", weeklyTarget: null })).toBe("その他・早起き");
  });
});
