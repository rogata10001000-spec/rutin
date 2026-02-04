"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertPayoutRule } from "@/actions/admin/payout-rules";
import { payoutRuleSchema } from "@/schemas/payout";
import type { CastListItem } from "@/actions/admin/pricing";
import { useToast } from "@/components/common/Toast";

type PayoutRuleFormProps = {
  casts: CastListItem[];
};

type FieldErrors = {
  castId?: string;
  percent?: string;
  effectiveFrom?: string;
};

export function PayoutRuleForm({ casts }: PayoutRuleFormProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [scopeType, setScopeType] = useState<"global" | "cast">("global");
  const [castId, setCastId] = useState("");
  const [percent, setPercent] = useState("50");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // クライアント側Zodバリデーション
    const formData = {
      ruleType: "gift_share" as const,
      scopeType,
      castId: scopeType === "cast" ? castId : undefined,
      percent: percent ? parseInt(percent, 10) : 0,
      effectiveFrom,
      active: true,
    };

    const parsed = payoutRuleSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      // castIdのバリデーションエラーをチェック
      if (scopeType === "cast" && !castId) {
        fieldErrors.castId = "キャストを選択してください";
      }
      setErrors(fieldErrors);
      showToast("入力内容を確認してください", "error");
      return;
    }

    setLoading(true);

    try {
      const result = await upsertPayoutRule(parsed.data as Required<typeof parsed.data>);

      if (result.ok) {
        showToast("ルールを保存しました", "success");
        router.refresh();
        // フォームリセット
        setScopeType("global");
        setCastId("");
        setPercent("50");
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("保存に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-bold text-stone-700">
          適用範囲
        </label>
        <div className="relative mt-1.5">
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as "global" | "cast")}
            className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
          >
            <option value="global">全体（デフォルト）</option>
            <option value="cast">キャスト別</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {scopeType === "cast" && (
        <div>
          <label className="block text-sm font-bold text-stone-700">
            キャスト
          </label>
          <div className="relative mt-1.5">
            <select
              value={castId}
              onChange={(e) => setCastId(e.target.value)}
              className={`block w-full appearance-none rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                errors.castId
                  ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
                  : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
              }`}
              required
            >
              <option value="">選択してください</option>
              {casts.map((cast) => (
                <option key={cast.id} value={cast.id}>
                  {cast.displayName}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {errors.castId && (
            <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.castId}</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-stone-700">
          配分率（%）
        </label>
        <input
          type="number"
          min="0"
          max="100"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.percent
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.percent ? (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.percent}</p>
        ) : (
          <p className="mt-1.5 text-xs text-stone-400">
            キャストに配分される売上（税抜）の割合
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          適用開始日
        </label>
        <input
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.effectiveFrom
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.effectiveFrom && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.effectiveFrom}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-terracotta px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:opacity-50 transition-all"
      >
        {loading ? "保存中..." : "保存"}
      </button>

      <ToastContainer />
    </form>
  );
}
