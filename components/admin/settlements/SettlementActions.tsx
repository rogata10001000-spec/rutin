"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SettlementBatch } from "@/actions/admin/settlements";
import {
  approveSettlementBatch,
  markSettlementBatchPaid,
} from "@/actions/admin/settlements";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

type SettlementActionsProps = {
  batch: SettlementBatch;
};

export function SettlementActions({ batch }: SettlementActionsProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [action, setAction] = useState<"approve" | "paid" | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (!action) return;

    setLoading(true);
    try {
      const result =
        action === "approve"
          ? await approveSettlementBatch({ batchId: batch.id })
          : await markSettlementBatchPaid({ batchId: batch.id });

      if (result.ok) {
        showToast(
          action === "approve" ? "承認しました" : "支払完了にしました",
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

  return (
    <>
      <div className="flex gap-2">
        {batch.status === "draft" && (
          <button
            onClick={() => setAction("approve")}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            承認する
          </button>
        )}
        {batch.status === "approved" && (
          <button
            onClick={() => setAction("paid")}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            支払完了にする
          </button>
        )}
      </div>

      <ConfirmDialog
        open={!!action}
        title={action === "approve" ? "バッチの承認" : "支払完了の確認"}
        description={
          action === "approve"
            ? `合計 ¥${batch.totalAmount.toLocaleString()} を ${batch.castCount}人のキャストに支払うことを承認しますか？`
            : `合計 ¥${batch.totalAmount.toLocaleString()} の支払いが完了しましたか？この操作は取り消せません。`
        }
        confirmLabel={action === "approve" ? "承認" : "支払完了"}
        variant={action === "paid" ? "danger" : "default"}
        onConfirm={handleAction}
        onCancel={() => setAction(null)}
        loading={loading}
      />

      <ToastContainer />
    </>
  );
}
