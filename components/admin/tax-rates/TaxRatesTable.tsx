"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { TaxRate } from "@/actions/admin/tax-rates";
import { toggleTaxRateActive } from "@/actions/admin/tax-rates";
import { UpsertTaxRateDialog } from "./UpsertTaxRateDialog";
import { useToast } from "@/components/common/Toast";

type TaxRatesTableProps = {
  items: TaxRate[];
};

export function TaxRatesTable({ items }: TaxRatesTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [editItem, setEditItem] = useState<TaxRate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const openNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const openEdit = (item: TaxRate) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    const result = await toggleTaxRateActive(id);
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
          税率を追加
        </button>
      </div>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  名称
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  税率
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
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-stone-900">
                    {item.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {(item.rate * 100).toFixed(1)}%
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {format(new Date(item.effectiveFrom), "yyyy/MM/dd")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.active
                          ? "bg-sage/20 text-sage-800" // Sage green for active
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
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-stone-100 p-3">
            <svg className="h-6 w-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-stone-900">税率が設定されていません</p>
          <p className="mt-1 text-sm text-stone-500">新しい税率を追加してください。</p>
        </div>
      )}

      <UpsertTaxRateDialog
        open={dialogOpen}
        editItem={editItem}
        onClose={() => setDialogOpen(false)}
      />

      <ToastContainer />
    </>
  );
}
