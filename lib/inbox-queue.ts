/**
 * 「今日の対応」キューの並び順（純粋関数・単体テスト対象）。
 *
 * 1人で130人を回す前提: 開いた順に承認→送信→次へ、を止めずに流せるよう、
 * 「今すぐ返すべき人」から「今日まだ声をかけていない人」の順に1本の列にする。
 *   1. 未返信 かつ 未解決リスクあり（心身の不調サイン）
 *   2. 未返信（待たせている時間が長い順）
 *   3. 今日まだ送っていない人（最後の受信が古い順＝沈黙が長い人を先に）
 *   4. 今日対応済み（キューの対象外。並びの末尾）
 */

export type QueueItemLike = {
  id: string;
  hasRisk: boolean;
  replyStatus: "unreplied" | "not_sent_today" | "replied";
  unrepliedMinutes: number | null;
  lastUserMessageAt: string | null;
};

export function queueRank(item: QueueItemLike): number {
  if (item.replyStatus === "unreplied") return item.hasRisk ? 0 : 1;
  if (item.replyStatus === "not_sent_today") return 2;
  return 3;
}

function toTime(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

export function compareForQueue(a: QueueItemLike, b: QueueItemLike): number {
  const ra = queueRank(a);
  const rb = queueRank(b);
  if (ra !== rb) return ra - rb;
  if (ra <= 1) return (b.unrepliedMinutes ?? -1) - (a.unrepliedMinutes ?? -1);
  if (ra === 2) return toTime(a.lastUserMessageAt) - toTime(b.lastUserMessageAt);
  return toTime(b.lastUserMessageAt) - toTime(a.lastUserMessageAt);
}

export function sortForQueue<T extends QueueItemLike>(items: T[]): T[] {
  return [...items].sort(compareForQueue);
}

/** キュー対象（まだ対応していない人）か */
export function isQueueTarget(item: QueueItemLike): boolean {
  return item.replyStatus !== "replied";
}

/**
 * 次に開く人。現在の人より後ろで、まだ対応していない最初の人。
 * 現在の人が一覧に無い（対応済みで外れた等）場合は先頭から探す。
 */
export function nextInQueue<T extends QueueItemLike>(sorted: T[], currentId: string | null): T | null {
  const idx = currentId ? sorted.findIndex((i) => i.id === currentId) : -1;
  const after = sorted.slice(idx + 1).find((i) => isQueueTarget(i) && i.id !== currentId);
  if (after) return after;
  // 後ろに居なければ前方（現在の人より前で未対応のまま残っている人）
  return sorted.slice(0, Math.max(idx, 0)).find((i) => isQueueTarget(i) && i.id !== currentId) ?? null;
}

/** 現在の人を除く、まだ対応していない人数 */
export function queueRemaining(sorted: QueueItemLike[], currentId: string | null): number {
  return sorted.filter((i) => isQueueTarget(i) && i.id !== currentId).length;
}

/**
 * 自動生成する下書きへの指示。沈黙している人には「責めない短い声かけ」を頼む。
 * 直近が受信（返信待ち）なら指示なし（通常の3案）。
 */
export function queueDraftInstruction(input: {
  lastMessageDirection: "in" | "out" | null;
  lastUserMessageAt: string | null;
  now?: Date;
}): string | null {
  if (input.lastMessageDirection === "in") return null;
  const now = input.now ?? new Date();
  const days = input.lastUserMessageAt
    ? Math.floor((now.getTime() - new Date(input.lastUserMessageAt).getTime()) / 86400000)
    : null;
  if (days !== null && days >= 2) {
    return `${days}日ほど報告がありません。責めず、返信しやすい短い声かけ（1〜2文）にしてください。`;
  }
  return "今日の様子を聞く短い声かけ（1〜2文）にしてください。";
}
