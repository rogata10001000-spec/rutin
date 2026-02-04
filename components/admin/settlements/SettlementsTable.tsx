"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SettlementBatch } from "@/actions/admin/settlements";
import {
  approveSettlementBatch,
  markSettlementBatchPaid,
} from "@/actions/admin/settlements";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

type SettlementsTableProps = {
  items: SettlementBatch[];
};

const statusConfig = {
  draft: { label: "下書き", className: "bg-stone-100 text-stone-600" },
  approved: { label: "承認済", className: "bg-sage/20 text-sage-800" },
  paid: { label: "支払完了", className: "bg-terracotta/10 text-terracotta" },
};

export function SettlementsTable({ items }: SettlementsTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [action, setAction] = useState<{
    type: "approve" | "paid";
    batchId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (!action) return;

    setLoading(true);
    try {
      const result =
        action.type === "approve"
          ? await approveSettlementBatch({ batchId: action.batchId })
          : await markSettlementBatchPaid({ batchId: action.batchId });

      if (result.ok) {
        showToast(
          action.type === "approve" ? "承認しました" : "支払完了にしました",
          "success"
        );
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("処理に失敗しました", "error");
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
        精算バッチがありません
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
                  期間
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  状態
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  合計金額
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  キャスト数
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {items.map((item) => {
                const config = statusConfig[item.status];
                return (
                  <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <Link
                        href={`/admin/settlements/${item.id}`}
                        className="font-bold text-stone-800 hover:text-terracotta"
                      >
                        {format(new Date(item.periodFrom), "yyyy/MM/dd")} -{" "}
                        {format(new Date(item.periodTo), "yyyy/MM/dd")}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${config.className}`}
                      >
                        {config.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                      ¥{item.totalAmount.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      {item.castCount}人
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 space-x-3">
                      {item.status === "draft" && (
                        <button
                          onClick={() =>
                            setAction({ type: "approve", batchId: item.id })
                          }
                          className="text-sm font-bold text-terracotta hover:text-[#d0694e]"
                        >
                          承認
                        </button>
                      )}
                      {item.status === "approved" && (
                        <button
                          onClick={() =>
                            setAction({ type: "paid", batchId: item.id })
                          }
                          className="text-sm font-bold text-sage-600 hover:text-sage-800"
                        >
                          支払完了
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!action}
        title={action?.type === "approve" ? "バッチの承認" : "支払完了の確認"}
        description={
          action?.type === "approve"
            ? "このバッチを承認しますか？"
            : "支払完了にしますか？この操作は取り消せません。"
        }
        confirmLabel={action?.type === "approve" ? "承認" : "支払完了"}
        variant={action?.type === "paid" ? "danger" : "default"}
        onConfirm={handleAction}
        onCancel={() => setAction(null)}
        loading={loading}
      />

      <ToastContainer />
    </>
  );
}
