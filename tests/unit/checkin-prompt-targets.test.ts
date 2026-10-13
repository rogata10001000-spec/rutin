import { describe, expect, it } from "vitest";
import { checkinAckText, selectCheckinPromptTargets } from "@/lib/checkin-prompt-targets";

const base = { status: "active", plan_code: "standard", line_user_id: "U1", is_blocked: false };

describe("selectCheckinPromptTargets", () => {
  it("契約中・催促ONプラン・未ブロック・LINEあり・今日未回答だけを対象にする", () => {
    const users = [
      { id: "a", ...base },
      { id: "b", ...base, status: "paused" }, // 一時停止 → 送らない
      { id: "c", ...base, status: "incomplete" }, // 未契約 → 送らない
      { id: "d", ...base, status: "trial" }, // トライアル → 送る
      { id: "e", ...base, plan_code: "light" }, // 催促OFFプラン → 送らない
      { id: "f", ...base, is_blocked: true },
      { id: "g", ...base, line_user_id: null },
      { id: "h", ...base }, // 今日回答済み → 送らない
    ];
    const r = selectCheckinPromptTargets(users, new Set(["standard", "premium"]), new Set(["h"]));
    expect(r.map((u) => u.id)).toEqual(["a", "d"]);
  });
  it("受け取り確認は敬体で感嘆符なし", () => {
    for (const s of ["circle", "triangle", "cross"] as const) {
      const t = checkinAckText(s);
      expect(t).toMatch(/記録しました/);
      expect(t).not.toMatch(/[!！]/);
    }
  });
});
