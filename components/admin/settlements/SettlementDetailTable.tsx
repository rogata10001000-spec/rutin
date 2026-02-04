"use client";

import type { SettlementItem } from "@/actions/admin/settlements";

type SettlementDetailTableProps = {
  items: SettlementItem[];
};

export function SettlementDetailTable({ items }: SettlementDetailTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        明細がありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              キャスト
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              金額
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              対象件数
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                {item.castName}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                ¥{item.amount.toLocaleString()}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {item.calculationCount}件
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50">
          <tr>
            <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-gray-900">
              合計
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-gray-900">
              ¥{items.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
              {items.reduce((sum, item) => sum + item.calculationCount, 0)}件
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
