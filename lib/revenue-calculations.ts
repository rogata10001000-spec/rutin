/**
 * 売上集計ユーティリティ（テスト可能な純粋関数）
 */

export type RevenueEventInput = {
  id: string;
  eventType: string;
  castId: string | null;
  amountExclTaxJpy: number;
  amountInclTaxJpy: number;
};

export type PayoutInput = {
  revenueEventId: string;
  castId: string;
  amountJpy: number;
};

export type MateRevenueRow = {
  castId: string;
  castName: string;
  payoutAmountJpy: number;
  eventCount: number;
  subscriptionCount: number;
  giftCount: number;
};

export type RevenueBreakdown = {
  subscriptionInclTaxJpy: number;
  giftInclTaxJpy: number;
  subscriptionCount: number;
  giftCount: number;
};

export type RevenueSummary = {
  totalInclTaxJpy: number;
  totalExclTaxJpy: number;
  matePayoutTotalJpy: number;
  headquartersNetJpy: number;
  breakdown: RevenueBreakdown;
  mateRows: MateRevenueRow[];
};

const COUNTED_EVENT_TYPES = new Set(["subscription_monthly", "gift_redeem"]);

export function aggregateRevenueSummary(
  events: RevenueEventInput[],
  payouts: PayoutInput[],
  castNames: Record<string, string>
): RevenueSummary {
  const filteredEvents = events.filter((e) => COUNTED_EVENT_TYPES.has(e.eventType));

  const eventTypeById = new Map(filteredEvents.map((e) => [e.id, e.eventType]));

  let totalInclTaxJpy = 0;
  let totalExclTaxJpy = 0;
  let subscriptionInclTaxJpy = 0;
  let giftInclTaxJpy = 0;
  let subscriptionCount = 0;
  let giftCount = 0;

  for (const event of filteredEvents) {
    totalInclTaxJpy += event.amountInclTaxJpy;
    totalExclTaxJpy += event.amountExclTaxJpy;
    if (event.eventType === "subscription_monthly") {
      subscriptionInclTaxJpy += event.amountInclTaxJpy;
      subscriptionCount += 1;
    } else if (event.eventType === "gift_redeem") {
      giftInclTaxJpy += event.amountInclTaxJpy;
      giftCount += 1;
    }
  }

  let matePayoutTotalJpy = 0;
  const mateMap = new Map<string, MateRevenueRow>();

  for (const payout of payouts) {
    const eventType = eventTypeById.get(payout.revenueEventId);
    if (!eventType) continue;

    matePayoutTotalJpy += payout.amountJpy;

    const existing = mateMap.get(payout.castId) ?? {
      castId: payout.castId,
      castName: castNames[payout.castId] ?? "不明",
      payoutAmountJpy: 0,
      eventCount: 0,
      subscriptionCount: 0,
      giftCount: 0,
    };

    existing.payoutAmountJpy += payout.amountJpy;
    existing.eventCount += 1;
    if (eventType === "subscription_monthly") {
      existing.subscriptionCount += 1;
    } else if (eventType === "gift_redeem") {
      existing.giftCount += 1;
    }

    mateMap.set(payout.castId, existing);
  }

  const mateRows = Array.from(mateMap.values()).sort(
    (a, b) => b.payoutAmountJpy - a.payoutAmountJpy
  );

  return {
    totalInclTaxJpy,
    totalExclTaxJpy,
    matePayoutTotalJpy,
    headquartersNetJpy: totalExclTaxJpy - matePayoutTotalJpy,
    breakdown: {
      subscriptionInclTaxJpy,
      giftInclTaxJpy,
      subscriptionCount,
      giftCount,
    },
    mateRows,
  };
}
