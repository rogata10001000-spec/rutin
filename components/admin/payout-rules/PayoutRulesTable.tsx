"use client";

import { useState, useOptimistic, useTransition } from "react";
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
  const [, startTransition] = useTransition();
  // 無効化は即座に見た目を反映する（サーバー応答を待たない）
  const [optimisticItems, setOptimisticItems] = useOptimistic(
    items,
    (state, ruleId: string) =>
      state.map((i) => (i.id === ruleId ? { ...i, active: false } : i))
  );
  // 確認ダイアログの対象（confirm state）と送信中の行（async state）は別に持つ。
  // 1つの state で兼ねると、確認中と送信中を区別できず連打で二重送信になる。
  const [pendingDeactivateId, setPendingDeactivateId] = useState<string | null>(null);
  const [deactivatingIds, setDeactivatingIds] = useState<ReadonlySet<string>>(new Set());

  const handleDeactivate = (ruleId: string) => {
    if (deactivatingIds.has(ruleId)) return;
    setDeactivatingIds((prev) => new Set(prev).add(ruleId));
    // 確認は済んだので待たずに閉じる（開いたままだと楽観表示が見えない）
    setPendingDeactivateId(null);

    startTransition(async () => {
      setOptimisticItems(ruleId);
      try {
        const result = await deactivatePayoutRule({ ruleId });
        if (result.ok) {
          showToast("ルールを無効化しました", "success");
          // 楽観表示はこのトランジションが終わると破棄されるため、
          // 同じトランジション内で最新のサーバー props を取り込んでから終える
          router.refresh();
        } else {
          showToast(
            result.error.code === "FORBIDDEN" || result.error.code === "UNAUTHORIZED"
              ? `${result.error.message}。権限のある管理者に操作を依頼してください`
              : `${result.error.message}。表示は元に戻しました。時間をおいてもう一度お試しください`,
            "error"
          );
        }
      } catch {
        showToast(
          "通信に失敗し、ルールを無効化できませんでした。通信状況を確認してもう一度お試しください",
          "error"
        );
      } finally {
        setDeactivatingIds((prev) => {
          const next = new Set(prev);
          next.delete(ruleId);
          return next;
        });
      }
    });
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
                  種別
                </th>
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
              {optimisticItems.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-stone-700">
                    {item.ruleType === "subscription_share" ? "サブスク" : "ギフト"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        item.scopeType === "global"
                          ? "bg-stone-100 text-stone-600"
                          : "bg-terracotta/10 text-terracotta"
                      }`}
                    >
                      {item.scopeType === "global"
                        ? "全体"
                        : item.scopeType === "cast_plan"
                          ? "メイト×プラン"
                          : "メイト"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-900 font-medium">
                    {item.castName ?? "-"}
                    {item.planCode && (
                      <span className="ml-2 rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                        {item.planCode}
                      </span>
                    )}
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
                        onClick={() => setPendingDeactivateId(item.id)}
                        disabled={deactivatingIds.has(item.id)}
                        aria-busy={deactivatingIds.has(item.id)}
                        className="text-sm font-bold text-red-500 hover:text-red-700 disabled:opacity-50"
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

      {/* 確認したら即座に閉じて楽観表示に切り替えるため、loading は渡さない
          （閉じたダイアログの loading は表示されず、状態が食い違う） */}
      <ConfirmDialog
        open={pendingDeactivateId !== null}
        title="ルールの無効化"
        description="このルールを無効化しますか？"
        confirmLabel="無効化"
        variant="danger"
        onConfirm={() => pendingDeactivateId && handleDeactivate(pendingDeactivateId)}
        onCancel={() => setPendingDeactivateId(null)}
      />

      <ToastContainer />
    </>
  );
}
