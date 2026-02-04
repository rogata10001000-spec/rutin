"use client";

import type { PriceOverride } from "@/actions/admin/pricing";
import { format } from "date-fns";

type PricingTableProps = {
  items: PriceOverride[];
};

const planLabels: Record<string, string> = {
  light: "Light",
  standard: "Standard",
  premium: "Premium",
};

export function PricingTable({ items }: PricingTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
        価格オーバーライドが設定されていません
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                キャスト
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                プラン
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                月額
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                適用開始
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                状態
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white">
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                  {item.castName}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                  {planLabels[item.planCode] ?? item.planCode}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                  ¥{item.amountMonthly.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                  {format(new Date(item.validFrom), "yyyy/MM/dd")}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.active
                        ? "bg-sage/20 text-sage-800"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {item.active ? "有効" : "無効"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
