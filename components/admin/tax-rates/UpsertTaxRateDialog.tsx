"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upsertTaxRate, type TaxRate } from "@/actions/admin/tax-rates";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  name: z.string().min(1, "名称を入力してください").max(50, "名称は50文字以内で入力してください"),
  rate: z.string().min(1, "税率を入力してください"),
  effectiveFrom: z.string().min(1, "有効開始日を入力してください"),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

type UpsertTaxRateDialogProps = {
  open: boolean;
  editItem: TaxRate | null;
  onClose: () => void;
};

export function UpsertTaxRateDialog({ open, editItem, onClose }: UpsertTaxRateDialogProps) {
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
      name: "",
      rate: "",
      effectiveFrom: "",
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
          name: editItem.name,
          rate: (editItem.rate * 100).toString(),
          effectiveFrom: editItem.effectiveFrom,
          active: editItem.active,
        });
      } else {
        reset({
          name: "",
          rate: "10",
          effectiveFrom: new Date().toISOString().split("T")[0],
          active: true,
        });
      }
    }
  }, [open, editItem, reset]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const rate = parseFloat(data.rate) / 100;
      if (isNaN(rate) || rate < 0 || rate > 1) {
        showToast("税率は0%〜100%の範囲で入力してください", "error");
        setSubmitting(false);
        return;
      }

      const result = await upsertTaxRate({
        id: editItem?.id,
        name: data.name,
        rate,
        effectiveFrom: data.effectiveFrom,
        active: data.active,
      });

      if (result.ok) {
        showToast(editItem ? "税率を更新しました" : "税率を作成しました", "success");
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
              {editItem ? "税率を編集" : "税率を追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  名称 <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  {...register("name")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="例: 消費税（標準税率）"
                />
                {errors.name && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              {/* Rate */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  税率（%） <span className="text-terracotta">*</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    type="number"
                    step="0.1"
                    {...register("rate")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 pr-8 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 font-medium">
                    %
                  </span>
                </div>
                {errors.rate && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.rate.message}</p>
                )}
              </div>

              {/* Effective From */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  有効開始日 <span className="text-terracotta">*</span>
                </label>
                <input
                  type="date"
                  {...register("effectiveFrom")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                {errors.effectiveFrom && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.effectiveFrom.message}</p>
                )}
              </div>

              {/* Active */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-stone-50/50">
                <div>
                  <label className="block text-sm font-bold text-stone-700">
                    有効
                  </label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    無効にすると計算に使用されません
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
