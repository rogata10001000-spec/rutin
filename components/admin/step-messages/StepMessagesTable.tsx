"use client";

import { useState, useOptimistic, useTransition } from "react";
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
  const [, startTransition] = useTransition();
  // 削除は即座に行を消す（サーバー応答を待たない）
  const [optimisticItems, setOptimisticItems] = useOptimistic(
    items,
    (state, id: string) => state.filter((i) => i.id !== id)
  );
  // 確認ダイアログの対象（confirm state）と送信中の行（async state）は別に持つ
  const [pendingDelete, setPendingDelete] = useState<StepMessage | null>(null);
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());

  const openCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };
  const openEdit = (item: StepMessage) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    if (deletingIds.has(id)) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    // 確認は済んだので待たずに閉じる（開いたままだと行が消えるのが見えない）
    setPendingDelete(null);

    startTransition(async () => {
      setOptimisticItems(id);
      try {
        const result = await deleteStepMessage(id);
        if (result.ok) {
          showToast("削除しました", "success");
          // 楽観表示はこのトランジションが終わると破棄されるため、
          // 同じトランジション内で最新のサーバー props を取り込んでから終える
          router.refresh();
        } else {
          showToast(
            result.error.code === "FORBIDDEN" || result.error.code === "UNAUTHORIZED"
              ? `${result.error.message}。権限のある管理者に操作を依頼してください`
              : `${result.error.message}。削除したステップは一覧に戻しました。時間をおいてもう一度お試しください`,
            "error"
          );
        }
      } catch {
        showToast(
          "通信に失敗し、ステップを削除できませんでした。通信状況を確認してもう一度お試しください",
          "error"
        );
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
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

      {optimisticItems.length === 0 ? (
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
                {optimisticItems.map((item) => (
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
                      <span className="flex max-w-md items-center gap-1.5">
                        {item.imageUrl && (
                          <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-500">
                            📷 画像
                          </span>
                        )}
                        <span className="truncate">{item.body || (item.imageUrl ? "（画像のみ）" : "")}</span>
                      </span>
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
                          disabled={deletingIds.has(item.id)}
                          aria-busy={deletingIds.has(item.id)}
                          className="rounded-lg px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
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

      {/* 確認したら即座に閉じて楽観表示に切り替えるため、loading は渡さない
          （閉じたダイアログの loading は表示されず、状態が食い違う） */}
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
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ToastContainer />
    </>
  );
}
