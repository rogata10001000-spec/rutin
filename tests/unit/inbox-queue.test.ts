import { describe, expect, it } from "vitest";
import { nextInQueue, queueDraftInstruction, queueRemaining, sortForQueue } from "@/lib/inbox-queue";

const NOW = new Date("2026-10-14T03:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

const items = [
  { id: "replied", hasRisk: false, replyStatus: "replied" as const, unrepliedMinutes: null, lastUserMessageAt: ago(1) },
  { id: "silent5d", hasRisk: false, replyStatus: "not_sent_today" as const, unrepliedMinutes: null, lastUserMessageAt: ago(120) },
  { id: "unreplied30", hasRisk: false, replyStatus: "unreplied" as const, unrepliedMinutes: 30, lastUserMessageAt: ago(0.5) },
  { id: "silent1d", hasRisk: false, replyStatus: "not_sent_today" as const, unrepliedMinutes: null, lastUserMessageAt: ago(24) },
  { id: "unreplied300", hasRisk: false, replyStatus: "unreplied" as const, unrepliedMinutes: 300, lastUserMessageAt: ago(5) },
  { id: "riskUnreplied", hasRisk: true, replyStatus: "unreplied" as const, unrepliedMinutes: 10, lastUserMessageAt: ago(0.2) },
];

describe("sortForQueue", () => {
  it("リスクあり未返信 → 未返信（長い順） → 今日未送信（沈黙が長い順） → 対応済み", () => {
    expect(sortForQueue(items).map((i) => i.id)).toEqual([
      "riskUnreplied",
      "unreplied300",
      "unreplied30",
      "silent5d",
      "silent1d",
      "replied",
    ]);
  });
  it("次の人は現在より後ろの未対応、末尾なら前方の未対応、対応済みは飛ばす", () => {
    const sorted = sortForQueue(items);
    expect(nextInQueue(sorted, "riskUnreplied")?.id).toBe("unreplied300");
    expect(nextInQueue(sorted, "silent1d")?.id).toBe("riskUnreplied");
    expect(nextInQueue(sorted, null)?.id).toBe("riskUnreplied");
    expect(nextInQueue(sorted.filter((i) => i.id === "replied"), null)).toBeNull();
    expect(queueRemaining(sorted, "riskUnreplied")).toBe(4);
  });
  it("下書きの指示: 受信待ちは指示なし、沈黙2日以上は日数つきの声かけ", () => {
    expect(queueDraftInstruction({ lastMessageDirection: "in", lastUserMessageAt: ago(1), now: NOW })).toBeNull();
    expect(queueDraftInstruction({ lastMessageDirection: "out", lastUserMessageAt: ago(24 * 5), now: NOW })).toMatch(/^5日ほど/);
    expect(queueDraftInstruction({ lastMessageDirection: "out", lastUserMessageAt: ago(10), now: NOW })).toMatch(/今日の様子/);
    expect(queueDraftInstruction({ lastMessageDirection: null, lastUserMessageAt: null, now: NOW })).toMatch(/今日の様子/);
  });
});
