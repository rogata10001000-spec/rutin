import type { RevenueSummary } from "@/lib/revenue-calculations";

type RevenueSummaryCardsProps = {
  summary: RevenueSummary;
};

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

export function RevenueSummaryCards({ summary }: RevenueSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-medium text-stone-500">システム全体の売上</h3>
        <p className="mt-2 text-2xl font-bold text-stone-900">
          {formatYen(summary.totalInclTaxJpy)}
        </p>
        <p className="mt-1 text-xs text-stone-500">税込（ユーザー支払い額）</p>
      </div>
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-medium text-stone-500">メイト配分合計</h3>
        <p className="mt-2 text-2xl font-bold text-sage-700">
          {formatYen(summary.matePayoutTotalJpy)}
        </p>
        <p className="mt-1 text-xs text-stone-500">税抜（精算と同じ基準）</p>
      </div>
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-medium text-stone-500">本部取り分</h3>
        <p className="mt-2 text-2xl font-bold text-terracotta">
          {formatYen(summary.headquartersNetJpy)}
        </p>
        <p className="mt-1 text-xs text-stone-500">税抜（売上 − メイト配分）</p>
      </div>
    </div>
  );
}
