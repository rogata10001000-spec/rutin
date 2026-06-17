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
  amountMonthly?: string;
  amountAnnual?: string;
};

export function PricingForm({ casts }: PricingFormProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [castId, setCastId] = useState("");
  const [planCode, setPlanCode] = useState<"light" | "standard" | "premium">("standard");
  const [amountMonthly, setAmountMonthly] = useState("");
  const [amountAnnual, setAmountAnnual] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const formData = {
      castId,
      planCode,
      amountMonthly: amountMonthly ? parseInt(amountMonthly, 10) : 0,
      ...(amountAnnual ? { amountAnnual: parseInt(amountAnnual, 10) } : {}),
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
      const result = await upsertCastPlanPriceOverride({
        castId,
        planCode,
        amountMonthly: parseInt(amountMonthly, 10),
        ...(amountAnnual ? { amountAnnual: parseInt(amountAnnual, 10) } : {}),
        active: true,
      });

      if (result.ok) {
        showToast("価格設定を保存しました", "success");
        router.refresh();
        setCastId("");
        setAmountMonthly("");
        setAmountAnnual("");
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("保存に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `mt-1.5 block w-full rounded-xl border bg-stone-50 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
      hasError
        ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500"
        : "border-stone-200 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-terracotta"
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-bold text-stone-700">メイト</label>
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
        <label className="block text-sm font-bold text-stone-700">プラン</label>
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
        <label className="block text-sm font-bold text-stone-700">月額（税込）</label>
        <input
          type="number"
          inputMode="numeric"
          value={amountMonthly}
          onChange={(e) => setAmountMonthly(e.target.value)}
          placeholder="6980"
          className={inputClass(Boolean(errors.amountMonthly))}
          required
        />
        {errors.amountMonthly && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.amountMonthly}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold text-stone-700">
          年額（税込・任意）
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={amountAnnual}
          onChange={(e) => setAmountAnnual(e.target.value)}
          placeholder="例: 69800（実質2ヶ月無料なら月額×10）"
          className={inputClass(Boolean(errors.amountAnnual))}
        />
        <p className="mt-1 text-xs text-stone-500">
          未入力の場合、このメイトの年額はデフォルト価格が適用されます。
        </p>
        {errors.amountAnnual && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.amountAnnual}</p>
        )}
      </div>

      <p className="rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
        入力した金額に対応する Stripe Price は自動で作成されます（表示額と請求額は常に一致）。
        既存契約者の金額は変わりません。反映するには各ユーザーの「価格変更」を実行してください。
      </p>

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
