"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upsertPointProduct, type PointProductAdmin } from "@/actions/admin/gifts";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  name: z.string().min(1, "商品名を入力してください").max(100, "商品名は100文字以内で入力してください"),
  points: z.string().min(1, "ポイント数を入力してください"),
  priceInclTaxJpy: z.string().min(1, "税込価格を入力してください"),
  stripePriceId: z.string().min(1, "Stripe Price IDを入力してください"),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

type UpsertPointProductDialogProps = {
  open: boolean;
  product: PointProductAdmin | null; // null = 新規作成
  onClose: () => void;
};

const TAX_RATE = 0.1; // 10%

export function UpsertPointProductDialog({ open, product, onClose }: UpsertPointProductDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      points: "",
      priceInclTaxJpy: "",
      stripePriceId: "",
      active: true,
    },
  });

  const priceInclTax = watch("priceInclTaxJpy");

  // 税抜価格を自動計算
  const priceExclTax = useMemo(() => {
    const incl = parseInt(priceInclTax, 10);
    if (isNaN(incl) || incl <= 0) return null;
    return Math.round(incl / (1 + TAX_RATE));
  }, [priceInclTax]);

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
      if (product) {
        reset({
          name: product.name,
          points: product.points.toString(),
          priceInclTaxJpy: product.priceInclTaxJpy.toString(),
          stripePriceId: product.stripePriceId,
          active: product.active,
        });
      } else {
        reset({
          name: "",
          points: "",
          priceInclTaxJpy: "",
          stripePriceId: "",
          active: true,
        });
      }
    }
  }, [open, product, reset]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await upsertPointProduct({
        id: product?.id,
        name: data.name,
        points: parseInt(data.points, 10),
        priceInclTaxJpy: parseInt(data.priceInclTaxJpy, 10),
        stripePriceId: data.stripePriceId,
        active: data.active,
      });

      if (result.ok) {
        showToast(product ? "ポイント商品を更新しました" : "ポイント商品を追加しました", "success");
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
              {product ? "ポイント商品を編集" : "新しいポイント商品を追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-bold text-stone-700"
                >
                  商品名 <span className="text-terracotta">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  {...register("name")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="例: 1,000ポイント"
                />
                {errors.name && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              {/* Points */}
              <div>
                <label
                  htmlFor="points"
                  className="block text-sm font-bold text-stone-700"
                >
                  付与ポイント数 <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="points"
                    type="number"
                    {...register("points")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 1000"
                    min="1"
                  />
                  <span className="text-sm font-bold text-stone-500">pt</span>
                </div>
                {errors.points && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.points.message}</p>
                )}
              </div>

              {/* Price (Tax Included) */}
              <div>
                <label
                  htmlFor="priceInclTaxJpy"
                  className="block text-sm font-bold text-stone-700"
                >
                  税込価格 <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-500">¥</span>
                  <input
                    id="priceInclTaxJpy"
                    type="number"
                    {...register("priceInclTaxJpy")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 1100"
                    min="1"
                  />
                </div>
                {priceExclTax !== null && (
                  <p className="mt-1.5 text-sm text-stone-500">
                    税抜: ¥{priceExclTax.toLocaleString()}（税率10%で自動計算）
                  </p>
                )}
                {errors.priceInclTaxJpy && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.priceInclTaxJpy.message}</p>
                )}
              </div>

              {/* Stripe Price ID */}
              <div>
                <label
                  htmlFor="stripePriceId"
                  className="block text-sm font-bold text-stone-700"
                >
                  Stripe Price ID <span className="text-terracotta">*</span>
                </label>
                <input
                  id="stripePriceId"
                  type="text"
                  {...register("stripePriceId")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 font-mono text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="price_xxxxx"
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  Stripeダッシュボードで作成したPriceのIDを入力
                </p>
                {errors.stripePriceId && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.stripePriceId.message}</p>
                )}
              </div>

              {/* Active */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-stone-50/50">
                <div>
                  <label
                    htmlFor="active"
                    className="block text-sm font-bold text-stone-700"
                  >
                    公開状態
                  </label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    非公開にするとユーザーに表示されません
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    id="active"
                    type="checkbox"
                    {...register("active")}
                    className="peer sr-only"
                  />
                  <div className="peer h-6 w-11 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-sage/30 transition-colors"></div>
                </label>
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
                {submitting ? "保存中..." : product ? "更新" : "追加"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
