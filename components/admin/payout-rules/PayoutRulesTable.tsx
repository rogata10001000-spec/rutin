"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayoutRule } from "@/actions/admin/payout-rules";
import { deactivatePayoutRule } from "@/actions/admin/payout-rules";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

type PayoutRulesTableProps = {
  items: PayoutRule[];
};

export function PayoutRulesTable({ items }: PayoutRulesTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const handleDeactivate = async (ruleId: string) => {
    try {
      const result = await deactivatePayoutRule({ ruleId });
      if (result.ok) {
        showToast("ルールを無効化しました", "success");
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("無効化に失敗しました", "error");
    } finally {
      setDeactivating(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
        配分ルールが設定されていません
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  範囲
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  対象
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  配分率
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  適用開始
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  状態
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        item.scopeType === "global"
                          ? "bg-stone-100 text-stone-600"
                          : "bg-terracotta/10 text-terracotta"
                      }`}
                    >
                      {item.scopeType === "global" ? "全体" : "キャスト"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-900 font-medium">
                    {item.castName ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                    {item.percent}%
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {format(new Date(item.effectiveFrom), "yyyy/MM/dd")}
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
                  <td className="whitespace-nowrap px-6 py-4">
                    {item.active && (
                      <button
                        onClick={() => setDeactivating(item.id)}
                        className="text-sm font-bold text-red-500 hover:text-red-700"
                      >
                        無効化
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deactivating}
        title="ルールの無効化"
        description="このルールを無効化しますか？"
        confirmLabel="無効化"
        variant="danger"
        onConfirm={() => deactivating && handleDeactivate(deactivating)}
        onCancel={() => setDeactivating(null)}
      />

      <ToastContainer />
    </>
  );
}
