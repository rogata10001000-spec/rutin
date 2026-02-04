"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSettlementBatch } from "@/actions/admin/settlements";
import { settlementPeriodSchema } from "@/schemas/settlements";
import { useToast } from "@/components/common/Toast";

type FieldErrors = {
  from?: string;
  to?: string;
  _root?: string;
};

export function CreateBatchForm() {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // デフォルトは前月
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [periodFrom, setPeriodFrom] = useState(
    lastMonth.toISOString().split("T")[0]
  );
  const [periodTo, setPeriodTo] = useState(
    lastMonthEnd.toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // クライアント側Zodバリデーション
    const parsed = settlementPeriodSchema.safeParse({
      from: periodFrom,
      to: periodTo,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors | undefined;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        } else if (!field) {
          // refineエラー（ルートレベル）
          fieldErrors._root = issue.message;
        }
      }
      setErrors(fieldErrors);
      showToast("入力内容を確認してください", "error");
      return;
    }

    setLoading(true);

    try {
      const result = await createSettlementBatch({
        periodFrom: parsed.data.from,
        periodTo: parsed.data.to,
      });

      if (result.ok) {
        showToast("精算バッチを作成しました", "success");
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("作成に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-bold text-stone-700">
          期間（開始）
        </label>
        <input
          type="date"
          value={periodFrom}
          onChange={(e) => setPeriodFrom(e.target.value)}
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.from
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.from && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.from}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          期間（終了）
        </label>
        <input
          type="date"
          value={periodTo}
          onChange={(e) => setPeriodTo(e.target.value)}
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.to
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.to && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.to}</p>
        )}
      </div>

      {errors._root && (
        <p className="text-xs text-red-600 font-medium">{errors._root}</p>
      )}

      <div className="rounded-xl bg-stone-50 p-4 border border-stone-100">
        <p className="text-xs text-stone-500">
          指定期間内の未精算の配分を集計してバッチを作成します
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-terracotta px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:opacity-50 transition-all"
      >
        {loading ? "作成中..." : "バッチ作成"}
      </button>

      <ToastContainer />
    </form>
  );
}
