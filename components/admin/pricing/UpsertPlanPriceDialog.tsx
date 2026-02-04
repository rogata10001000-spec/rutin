"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upsertPlanPrice, type PlanPrice } from "@/actions/admin/plan-prices";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  planCode: z.enum(["light", "standard", "premium"]),
  stripePriceId: z.string().min(1, "Stripe Price IDを入力してください"),
  amountMonthly: z.string().min(1, "金額を入力してください"),
  validFrom: z.string().min(1, "有効開始日を入力してください"),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

const PLAN_OPTIONS = [
  { value: "light", label: "ライト" },
  { value: "standard", label: "スタンダード" },
  { value: "premium", label: "プレミアム" },
] as const;

type UpsertPlanPriceDialogProps = {
  open: boolean;
  editItem: PlanPrice | null;
  onClose: () => void;
};

export function UpsertPlanPriceDialog({ open, editItem, onClose }: UpsertPlanPriceDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planCode: "standard",
      stripePriceId: "",
      amountMonthly: "",
      validFrom: "",
      active: true,
    },
  });

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      if (editItem) {
        reset({
          planCode: editItem.planCode as "light" | "standard" | "premium",
          stripePriceId: editItem.stripePriceId,
          amountMonthly: editItem.amountMonthly.toString(),
          validFrom: editItem.validFrom,
          active: editItem.active,
        });
      } else {
        reset({
          planCode: "standard",
          stripePriceId: "",
          amountMonthly: "",
          validFrom: new Date().toISOString().split("T")[0],
          active: true,
        });
      }
    }
  }, [open, editItem, reset]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await upsertPlanPrice({
        id: editItem?.id,
        planCode: data.planCode,
        stripePriceId: data.stripePriceId,
        amountMonthly: parseInt(data.amountMonthly, 10),
        validFrom: data.validFrom,
        active: data.active,
      });

      if (result.ok) {
        showToast(editItem ? "価格を更新しました" : "価格を作成しました", "success");
        onClose();
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("保存に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div
          className="relative z-50 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-stone-900/5"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex-shrink-0 border-b border-stone-100 bg-stone-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-stone-800">
              {editItem ? "プラン価格を編集" : "プラン価格を追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Plan Code */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  プラン <span className="text-terracotta">*</span>
                </label>
                <div className="relative mt-1.5">
                  <select
                    {...register("planCode")}
                    disabled={!!editItem}
                    className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta disabled:bg-stone-100"
                  >
                    {PLAN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  月額（JPY） <span className="text-terracotta">*</span>
                </label>
                <input
                  type="number"
                  {...register("amountMonthly")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="例: 3980"
                />
                {errors.amountMonthly && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.amountMonthly.message}</p>
                )}
              </div>

              {/* Stripe Price ID */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  Stripe Price ID <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  {...register("stripePriceId")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 font-mono text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="price_xxxxx"
                />
                {errors.stripePriceId && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.stripePriceId.message}</p>
                )}
              </div>

              {/* Valid From */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  有効開始日 <span className="text-terracotta">*</span>
                </label>
                <input
                  type="date"
                  {...register("validFrom")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                {errors.validFrom && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.validFrom.message}</p>
                )}
              </div>

              {/* Active */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-stone-50/50">
                <div>
                  <label className="block text-sm font-bold text-stone-700">
                    有効
                  </label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    無効にすると新規契約に使用されません
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    {...register("active")}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-sage/30 transition-colors"></div>
                </label>
              </div>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:opacity-50"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
