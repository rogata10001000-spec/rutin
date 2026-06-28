"use client";

import type { SettlementItem } from "@/actions/admin/settlements";

type SettlementDetailTableProps = {
  items: SettlementItem[];
};

export function SettlementDetailTable({ items }: SettlementDetailTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-500">
        この精算バッチには明細がありません。
        <span className="mt-1 block text-stone-400">
          対象期間にメイトへの配分対象となる売上が計上されると、ここに明細が作成されます。
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-200">
        <thead className="bg-stone-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
              メイト
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
              金額
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
              対象件数
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 bg-white">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-stone-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-900">
                {item.castName}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-900">
                ¥{item.amount.toLocaleString()}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-600">
                {item.calculationCount}件
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-stone-50">
          <tr>
            <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-stone-900">
              合計
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-stone-900">
              ¥{items.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-600">
              {items.reduce((sum, item) => sum + item.calculationCount, 0)}件
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
