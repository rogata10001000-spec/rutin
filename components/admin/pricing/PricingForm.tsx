"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCastPlanPriceOverride, type CastListItem } from "@/actions/admin/pricing";
import { pricingOverrideSchema } from "@/schemas/pricing";
import { useToast } from "@/components/common/Toast";
import { Select } from "@/components/common/Select";

type PricingFormProps = {
  casts: CastListItem[];
};

type FieldErrors = {
  castId?: string;
  stripePriceId?: string;
  amountMonthly?: string;
  validFrom?: string;
};

export function PricingForm({ casts }: PricingFormProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [castId, setCastId] = useState("");
  const [planCode, setPlanCode] = useState<"light" | "standard" | "premium">("standard");
  const [stripePriceId, setStripePriceId] = useState("");
  const [amountMonthly, setAmountMonthly] = useState("");
  const [validFrom, setValidFrom] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // クライアント側Zodバリデーション
    const formData = {
      castId,
      planCode,
      stripePriceId,
      amountMonthly: amountMonthly ? parseInt(amountMonthly, 10) : 0,
      validFrom,
      active: true,
    };

    const parsed = pricingOverrideSchema.safeParse(formData);
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
      const result = await upsertCastPlanPriceOverride(parsed.data as Required<typeof parsed.data>);

      if (result.ok) {
        showToast("価格設定を保存しました", "success");
        router.refresh();
        // フォームリセット
        setCastId("");
        setStripePriceId("");
        setAmountMonthly("");
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

      <div>
        <label className="block text-sm font-bold text-stone-700">
          プラン
        </label>
        <div className="mt-1.5">
          <Select
            aria-label="プラン"
            value={planCode}
            onChange={(value) => setPlanCode(value as "light" | "standard" | "premium")}
            options={[
              { value: "light", label: "Light" },
              { value: "standard", label: "Standard" },
              { value: "premium", label: "Premium" },
            ]}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          Stripe Price ID
        </label>
        <input
          type="text"
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          placeholder="price_xxx"
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.stripePriceId
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.stripePriceId && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.stripePriceId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          月額（税込）
        </label>
        <input
          type="number"
          value={amountMonthly}
          onChange={(e) => setAmountMonthly(e.target.value)}
          placeholder="6980"
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.amountMonthly
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.amountMonthly && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.amountMonthly}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          適用開始日
        </label>
        <input
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          className={`mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
            errors.validFrom
              ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
              : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
          }`}
          required
        />
        {errors.validFrom && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.validFrom}</p>
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
