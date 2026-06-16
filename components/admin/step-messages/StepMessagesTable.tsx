"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteStepMessage,
  type StepMessage,
} from "@/actions/admin/step-messages";
import { useToast } from "@/components/common/Toast";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { UpsertStepMessageDialog } from "./UpsertStepMessageDialog";

function formatDelay(hours: number): string {
  if (hours <= 0) return "即時";
  if (hours % 24 === 0) return `${hours / 24}日後`;
  if (hours < 24) return `${hours}時間後`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}日${rest}時間後`;
}

const TRIGGER_CONFIG: Record<StepMessage["trigger"], { label: string; className: string }> = {
  follow: { label: "友だち追加", className: "bg-sage/20 text-sage-800" },
  checkout_abandoned: { label: "カゴ落ち", className: "bg-amber-100 text-amber-700" },
};

type StepMessagesTableProps = {
  items: StepMessage[];
};

export function StepMessagesTable({ items }: StepMessagesTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StepMessage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StepMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };
  const openEdit = (item: StepMessage) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await deleteStepMessage(pendingDelete.id);
      if (result.ok) {
        showToast("削除しました", "success");
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("削除に失敗しました", "error");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          ステップを追加
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
          <EmptyState
            title="ステップがまだありません"
            description="「ステップを追加」から、登録後に自動送信するメッセージを作成しましょう。"
            action={{ label: "ステップを追加", onClick: openCreate }}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">トリガー</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">順番</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">送信タイミング</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">ラベル</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">本文</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">状態</th>
                  <th className="w-px whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TRIGGER_CONFIG[item.trigger].className}`}
                      >
                        {TRIGGER_CONFIG[item.trigger].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-stone-800">{item.stepOrder}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-600">{formatDelay(item.delayHours)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-600">{item.title ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-stone-600">
                      <span className="block max-w-md truncate">{item.body}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.active ? "bg-sage/20 text-sage-800" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {item.active ? "有効" : "停止中"}
                      </span>
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded-lg px-3 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/10"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => setPendingDelete(item)}
                          className="rounded-lg px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
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

      <UpsertStepMessageDialog
        open={dialogOpen}
        editItem={editItem}
        onClose={() => setDialogOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ステップを削除しますか？"
        description={
          pendingDelete
            ? `「${pendingDelete.title ?? pendingDelete.body.slice(0, 20)}」を削除します。この操作は取り消せません。`
            : ""
        }
        confirmLabel="削除する"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ToastContainer />
    </>
  );
}
