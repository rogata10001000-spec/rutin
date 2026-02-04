"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { PlanPrice } from "@/actions/admin/plan-prices";
import { togglePlanPriceActive } from "@/actions/admin/plan-prices";
import { UpsertPlanPriceDialog } from "./UpsertPlanPriceDialog";
import { useToast } from "@/components/common/Toast";

type PlanPricesTableProps = {
  items: PlanPrice[];
};

export function PlanPricesTable({ items }: PlanPricesTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [editItem, setEditItem] = useState<PlanPrice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const openNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const openEdit = (item: PlanPrice) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    const result = await togglePlanPriceActive(id);
    if (result.ok) {
      showToast("状態を切り替えました", "success");
      router.refresh();
    } else {
      showToast(result.error.message, "error");
    }
    setTogglingId(null);
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <button
          onClick={openNew}
          className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          価格を追加
        </button>
      </div>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    プラン
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    月額（JPY）
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    Stripe Price ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    有効開始日
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
                  <tr key={item.id} className={`transition-colors hover:bg-stone-50/50 ${!item.active ? "bg-stone-50/30" : ""}`}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                      {item.planName}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      ¥{item.amountMonthly.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-stone-400">
                      {item.stripePriceId.slice(0, 20)}...
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
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEdit(item)}
                          className="font-medium text-terracotta hover:text-[#d0694e]"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleToggle(item.id)}
                          disabled={togglingId === item.id}
                          className="font-medium text-stone-400 hover:text-stone-600 disabled:opacity-50"
                        >
                          {togglingId === item.id
                            ? "..."
                            : item.active
                            ? "無効化"
                            : "有効化"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
          デフォルト価格が設定されていません
        </div>
      )}

      <UpsertPlanPriceDialog
        open={dialogOpen}
        editItem={editItem}
        onClose={() => setDialogOpen(false)}
      />

      <ToastContainer />
    </>
  );
}
