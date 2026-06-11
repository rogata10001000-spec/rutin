import type { MateRevenueRow } from "@/lib/revenue-calculations";

type MateRevenueTableProps = {
  items: MateRevenueRow[];
};

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

export function MateRevenueTable({ items }: MateRevenueTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500">
        この期間のメイト別売上データはありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[800px] divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              メイト
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
              配分額（税抜）
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
              件数
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
              サブスク
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
              ギフト
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 bg-white">
          {items.map((item) => (
            <tr key={item.castId} className="hover:bg-stone-50/50">
              <td className="whitespace-nowrap px-5 py-4 font-medium text-stone-800">
                {item.castName}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-stone-800">
                {formatYen(item.payoutAmountJpy)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                {item.eventCount}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                {item.subscriptionCount}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                {item.giftCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
