"use client";

import { useState, useRef, useCallback } from "react";
import type { GiftCatalogAdmin } from "@/actions/admin/gifts";
import { deleteGiftCatalog } from "@/actions/admin/gifts";
import { UpsertGiftDialog } from "./UpsertGiftDialog";
import { useToast } from "@/components/common/Toast";

const DELETE_UNDO_MS = 5000;

type GiftCatalogTableProps = {
  items: GiftCatalogAdmin[];
};

export function GiftCatalogTable({ items: initialItems }: GiftCatalogTableProps) {
  const [localItems, setLocalItems] = useState(initialItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftCatalogAdmin | null>(null);
  const { showToast, ToastContainer } = useToast();
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleAddClick = () => {
    setSelectedGift(null);
    setDialogOpen(true);
  };

  const handleEditClick = (gift: GiftCatalogAdmin) => {
    setSelectedGift(gift);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedGift(null);
  };

  const handleDelete = useCallback((item: GiftCatalogAdmin) => {
    // 即座にリストから除外（楽観的削除）
    setLocalItems((prev) => prev.filter((i) => i.id !== item.id));

    // Undoタイマーを設定（5秒後に実際に削除）
    const timer = setTimeout(async () => {
      deleteTimers.current.delete(item.id);
      const result = await deleteGiftCatalog(item.id);
      if (!result.ok) {
        // 削除失敗時は元に戻す
        setLocalItems((prev) =>
          [...prev, item].sort((a, b) => a.sortOrder - b.sortOrder)
        );
        showToast(result.error.message, "error");
      }
    }, DELETE_UNDO_MS);

    deleteTimers.current.set(item.id, timer);

    showToast(`「${item.name}」を削除しました`, "success", {
      duration: DELETE_UNDO_MS,
      onUndo: () => {
        // タイマーをキャンセルして元に戻す
        const existingTimer = deleteTimers.current.get(item.id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          deleteTimers.current.delete(item.id);
        }
        setLocalItems((prev) =>
          [...prev, item].sort((a, b) => a.sortOrder - b.sortOrder)
        );
      },
    });
  }, [showToast]);

  return (
    <>
      {/* Header with Add Button */}
      <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white rounded-t-2xl">
        <div>
          <h3 className="text-base font-bold text-stone-800">一覧</h3>
          <p className="text-sm text-stone-500">{localItems.length}件</p>
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

      {localItems.length === 0 ? (
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
                {localItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className="animate-fade-in transition-colors hover:bg-stone-50/50"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
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
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEditClick(item)}
                          className="rounded-lg px-3 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/10"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-lg px-3 py-1 text-xs font-bold text-stone-400 hover:bg-red-50 hover:text-red-600"
                        >
                          削除
                        </button>
                      </div>
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
        onClose={handleDialogClose}
      />

      <ToastContainer />
    </>
  );
}
