"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertPayoutRule } from "@/actions/admin/payout-rules";
import { payoutRuleSchema } from "@/schemas/payout";
import type { CastListItem } from "@/actions/admin/pricing";
import { useToast } from "@/components/common/Toast";
import { Select } from "@/components/common/Select";

type PayoutRuleFormProps = {
  casts: CastListItem[];
};

type FieldErrors = {
  castId?: string;
  planCode?: string;
  percent?: string;
  effectiveFrom?: string;
};

export function PayoutRuleForm({ casts }: PayoutRuleFormProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [scopeType, setScopeType] = useState<"global" | "cast" | "cast_plan">("global");
  const [castId, setCastId] = useState("");
  const [planCode, setPlanCode] = useState<"light" | "standard" | "premium">("standard");
  const [percent, setPercent] = useState("50");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // クライアント側Zodバリデーション
    const formData = {
      ruleType: "subscription_share" as const,
      scopeType,
      castId: scopeType === "cast" || scopeType === "cast_plan" ? castId : undefined,
      planCode: scopeType === "cast_plan" ? planCode : undefined,
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
        setPlanCode("standard");
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
        <div className="mt-1.5">
          <Select
            aria-label="適用範囲"
            value={scopeType}
            onChange={(value) => setScopeType(value as "global" | "cast" | "cast_plan")}
            options={[
              { value: "global", label: "全体（デフォルト）" },
              { value: "cast", label: "メイト別" },
              { value: "cast_plan", label: "メイト×プラン別" },
            ]}
          />
        </div>
      </div>

      {(scopeType === "cast" || scopeType === "cast_plan") && (
        <div>
          <label className="block text-sm font-bold text-stone-700">
            メイト
          </label>
          <div className="mt-1.5">
            <Select
              aria-label="メイト"
              value={castId}
              onChange={setCastId}
              placeholder="選択してください"
              className={errors.castId ? "border-red-300 focus:border-red-500 focus:ring-red-500" : ""}
              options={[
                { value: "", label: "選択してください", disabled: true },
                ...casts.map((cast) => ({ value: cast.id, label: cast.displayName })),
              ]}
            />
          </div>
          {errors.castId && (
            <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.castId}</p>
          )}
        </div>
      )}

      {scopeType === "cast_plan" && (
        <div>
          <label className="block text-sm font-bold text-stone-700">
            プラン
          </label>
          <div className="mt-1.5">
            <Select
              aria-label="プラン"
              value={planCode}
              onChange={(value) => setPlanCode(value as "light" | "standard" | "premium")}
              className={errors.planCode ? "border-red-300 focus:border-red-500 focus:ring-red-500" : ""}
              options={[
                { value: "light", label: "Light" },
                { value: "standard", label: "Standard" },
                { value: "premium", label: "Premium" },
              ]}
            />
          </div>
          {errors.planCode && (
            <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.planCode}</p>
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
            メイトに配分される売上（税抜）の割合
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
