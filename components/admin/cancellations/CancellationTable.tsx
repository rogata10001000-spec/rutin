"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { PendingCancellationItem } from "@/actions/admin/cancellations";
import { BadgePlan, BadgeStatus } from "@/components/common/Badge";

type CancellationTableProps = {
  items: PendingCancellationItem[];
};

function formatPeriodEnd(iso: string | null): string {
  if (!iso) return "-";
  return format(new Date(iso), "yyyy年M月d日", { locale: ja });
}

export function CancellationTable({ items }: CancellationTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500">
        解約予定のユーザーはいません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[920px] divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              ユーザー
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              プラン
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              契約状態
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              担当メイト
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              解約予定日
            </th>
            <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 bg-white">
          {items.map((item) => (
            <tr key={item.subscriptionId} className="hover:bg-stone-50/50">
              <td className="whitespace-nowrap px-5 py-4">
                <Link
                  href={`/users/${item.endUserId}`}
                  className="font-bold text-stone-800 hover:text-terracotta"
                >
                  {item.nickname}
                </Link>
              </td>
              <td className="whitespace-nowrap px-5 py-4">
                <BadgePlan plan={item.planCode} />
              </td>
              <td className="whitespace-nowrap px-5 py-4">
                <BadgeStatus status={item.status} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-stone-600">
                {item.assignedCastName ?? "-"}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-stone-700">
                {formatPeriodEnd(item.currentPeriodEnd)}
              </td>
              <td className="w-px whitespace-nowrap px-5 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <Link
                    href={`/inbox?user=${item.endUserId}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-terracotta/10 px-4 py-2 text-sm font-bold text-terracotta hover:bg-terracotta/20"
                  >
                    受信トレイ
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
