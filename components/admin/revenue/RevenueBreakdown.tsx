import type { RevenueBreakdown as RevenueBreakdownType } from "@/lib/revenue-calculations";

type RevenueBreakdownProps = {
  breakdown: RevenueBreakdownType;
};

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

export function RevenueBreakdown({ breakdown }: RevenueBreakdownProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4">
      <h3 className="text-sm font-medium text-stone-500">売上内訳（税込）</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md bg-stone-50 p-4">
          <p className="text-xs font-medium text-stone-500">サブスクリプション</p>
          <p className="mt-1 text-xl font-bold text-stone-800">
            {formatYen(breakdown.subscriptionInclTaxJpy)}
          </p>
          <p className="mt-1 text-xs text-stone-500">{breakdown.subscriptionCount}件</p>
        </div>
        <div className="rounded-md bg-stone-50 p-4">
          <p className="text-xs font-medium text-stone-500">ギフト</p>
          <p className="mt-1 text-xl font-bold text-stone-800">
            {formatYen(breakdown.giftInclTaxJpy)}
          </p>
          <p className="mt-1 text-xs text-stone-500">{breakdown.giftCount}件</p>
        </div>
      </div>
    </div>
  );
}
