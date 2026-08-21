import { describe, expect, it } from "vitest";
import { assessLineQuota } from "@/lib/line-quota";

// JST 8/15 12:00（31日ある月の折り返し手前）
const MID_MONTH = new Date("2026-08-15T03:00:00Z");
// JST 8/1 12:00（月初: 分母1日）
const MONTH_START = new Date("2026-08-01T03:00:00Z");

describe("assessLineQuota", () => {
  it("無料プラン(200通)の通常時: safe", () => {
    const r = assessLineQuota({ snapshot: { limit: 200, used: 60 }, now: MID_MONTH });
    expect(r.remaining).toBe(140);
    expect(r.ratio).toBeCloseTo(0.3);
    // 15日で60通 → 31日で124通 → 上限内
    expect(r.projectedMonthEnd).toBe(124);
    expect(r.willExceed).toBe(false);
    expect(r.warnLevel).toBe("safe");
  });

  it("使用率70%以上で warning", () => {
    const r = assessLineQuota({ snapshot: { limit: 200, used: 145 }, now: MID_MONTH });
    expect(r.warnLevel).toBe("warning");
  });

  it("使用率90%以上で critical", () => {
    const r = assessLineQuota({ snapshot: { limit: 200, used: 185 }, now: MID_MONTH });
    expect(r.warnLevel).toBe("critical");
    expect(r.remaining).toBe(15);
  });

  it("上限到達(超過)でも remaining は0未満にならない", () => {
    const r = assessLineQuota({ snapshot: { limit: 200, used: 210 }, now: MID_MONTH });
    expect(r.remaining).toBe(0);
    expect(r.warnLevel).toBe("critical");
  });

  it("比率が低くても残り20通以下なら warning（低上限プランの最低値ガード）", () => {
    // 上限5,000で残り18通=99.6%はcriticalになるので、ガードが効くのは意味のある残数のとき。
    // 例: 上限200・残り19通（90.5%）は ratio でも critical だが、
    // 「使用率がまだ低いのに残数が絶対的に少ない」ケースを固定する: 上限25・残り18。
    const r = assessLineQuota({ snapshot: { limit: 25, used: 7 }, now: MONTH_START });
    expect(r.remaining).toBe(18);
    expect(r.warnLevel).toBe("warning");
  });

  it("ペースが上限超過見込みなら比率が低くても warning（切り替え目安の早期警告）", () => {
    // 8/1に20通 → 31日換算620通 > 上限200。使用率はまだ10%
    const r = assessLineQuota({ snapshot: { limit: 200, used: 20 }, now: MONTH_START });
    expect(r.projectedMonthEnd).toBe(620);
    expect(r.willExceed).toBe(true);
    expect(r.warnLevel).toBe("warning");
  });

  it("上限なし（有料プラン相当/type:none）は常に safe・remaining/ratio は null", () => {
    const r = assessLineQuota({ snapshot: { limit: null, used: 9999 }, now: MID_MONTH });
    expect(r.remaining).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.willExceed).toBe(false);
    expect(r.warnLevel).toBe("safe");
  });

  it("上限0（異常値）でもゼロ除算しない", () => {
    const r = assessLineQuota({ snapshot: { limit: 0, used: 0 }, now: MID_MONTH });
    expect(r.warnLevel).toBe("critical");
  });
});
