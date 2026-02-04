"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { updatePlanSettings, type PlanAdmin } from "@/actions/admin/plans";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  replySlaMinutes: z.string().min(1, "SLA時間を入力してください"),
  slaWarningMinutes: z.string().min(1, "警告時間を入力してください"),
});

type FormData = z.infer<typeof formSchema>;

type EditPlanDialogProps = {
  open: boolean;
  plan: PlanAdmin | null;
  onClose: () => void;
};

const planNameConfig: Record<string, string> = {
  light: "Light",
  standard: "Standard",
  premium: "Premium",
};

export function EditPlanDialog({ open, plan, onClose }: EditPlanDialogProps) {
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
      replySlaMinutes: "",
      slaWarningMinutes: "",
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
    if (open && plan) {
      reset({
        replySlaMinutes: plan.replySlaMinutes.toString(),
        slaWarningMinutes: plan.slaWarningMinutes.toString(),
      });
    }
  }, [open, plan, reset]);

  const onSubmit = async (data: FormData) => {
    if (!plan) return;

    setSubmitting(true);
    try {
      const result = await updatePlanSettings({
        planCode: plan.planCode as "light" | "standard" | "premium",
        replySlaMinutes: parseInt(data.replySlaMinutes, 10),
        slaWarningMinutes: parseInt(data.slaWarningMinutes, 10),
      });

      if (result.ok) {
        showToast("プラン設定を更新しました", "success");
        onClose();
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("更新に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !plan) return null;

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
              プラン設定を編集
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {planNameConfig[plan.planCode] ?? plan.name}プランのSLA設定
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Warning */}
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 text-yellow-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-sm text-yellow-800 font-medium">
                    設定変更は既存ユーザーに即座に影響します。変更前に影響範囲を確認してください。
                  </p>
                </div>
              </div>

              {/* Reply SLA Minutes */}
              <div>
                <label
                  htmlFor="replySlaMinutes"
                  className="block text-sm font-bold text-stone-700"
                >
                  返信SLA（分） <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="replySlaMinutes"
                    type="number"
                    {...register("replySlaMinutes")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 720"
                    min="1"
                  />
                  <span className="text-sm font-bold text-stone-500">分</span>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">
                  ユーザーからのメッセージに返信すべき時間（例: 720分 = 12時間）
                </p>
                {errors.replySlaMinutes && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.replySlaMinutes.message}</p>
                )}
              </div>

              {/* SLA Warning Minutes */}
              <div>
                <label
                  htmlFor="slaWarningMinutes"
                  className="block text-sm font-bold text-stone-700"
                >
                  警告閾値（分） <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="slaWarningMinutes"
                    type="number"
                    {...register("slaWarningMinutes")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 120"
                    min="1"
                  />
                  <span className="text-sm font-bold text-stone-500">分</span>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">
                  SLA超過が近づいた際の警告タイミング（残り時間）
                </p>
                {errors.slaWarningMinutes && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.slaWarningMinutes.message}</p>
                )}
              </div>
            </div>

            {/* Footer */}
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
