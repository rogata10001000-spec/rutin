"use client";

import { useState } from "react";
import type { GiftCatalogAdmin } from "@/actions/admin/gifts";
import { UpsertGiftDialog } from "./UpsertGiftDialog";

type GiftCatalogTableProps = {
  items: GiftCatalogAdmin[];
};

export function GiftCatalogTable({ items }: GiftCatalogTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftCatalogAdmin | null>(null);

  const handleAddClick = () => {
    setSelectedGift(null);
    setDialogOpen(true);
  };

  const handleEditClick = (gift: GiftCatalogAdmin) => {
    setSelectedGift(gift);
    setDialogOpen(true);
  };

  return (
    <>
      {/* Header with Add Button */}
      <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white rounded-t-2xl">
        <div>
          <h3 className="text-base font-bold text-stone-800">一覧</h3>
          <p className="text-sm text-stone-500">{items.length}件</p>
        </div>
        <button
          onClick={handleAddClick}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          ギフトを追加
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-12 text-center text-stone-500 bg-white rounded-b-2xl border-x border-b border-stone-200">
          ギフトが登録されていません
        </div>
      ) : (
        <div className="overflow-hidden rounded-b-2xl border-x border-b border-stone-200 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    ギフト
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    カテゴリ
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    必要ポイント
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    表示順
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
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.icon ?? "🎁"}</span>
                        <span className="text-sm font-bold text-stone-900">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      {item.category ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-800">
                      {item.costPoints.toLocaleString()} pt
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      {item.sortOrder}
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
                      <button
                        onClick={() => handleEditClick(item)}
                        className="rounded-lg px-3 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/10"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialog */}
      <UpsertGiftDialog
        open={dialogOpen}
        gift={selectedGift}
        onClose={() => {
          setDialogOpen(false);
          setSelectedGift(null);
        }}
      />
    </>
  );
}
