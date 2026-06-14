"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upsertGiftCatalog, type GiftCatalogAdmin } from "@/actions/admin/gifts";
import { useToast } from "@/components/common/Toast";
import { Select } from "@/components/common/Select";

const formSchema = z.object({
  name: z.string().min(1, "ギフト名を入力してください").max(100, "ギフト名は100文字以内で入力してください"),
  icon: z.string().max(10).optional(),
  category: z.string().min(1, "カテゴリを選択してください"),
  costPoints: z.string().min(1, "必要ポイントを入力してください"),
  sortOrder: z.string().optional(),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

type UpsertGiftDialogProps = {
  open: boolean;
  gift: GiftCatalogAdmin | null; // null = 新規作成
  onClose: () => void;
};

const categoryOptions = [
  { value: "感謝", label: "感謝" },
  { value: "応援", label: "応援" },
  { value: "特別", label: "特別" },
];

const commonIcons = ["☕", "🍰", "🌸", "📚", "🎬", "🍱", "🎁", "✨", "💐", "🍫", "🎂", "💝"];

export function UpsertGiftDialog({ open, gift, onClose }: UpsertGiftDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      icon: "🎁",
      category: "感謝",
      costPoints: "",
      sortOrder: "",
      active: true,
    },
  });

  const selectedIcon = watch("icon");

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
      if (gift) {
        reset({
          name: gift.name,
          icon: gift.icon ?? "🎁",
          category: gift.category ?? "感謝",
          costPoints: gift.costPoints.toString(),
          sortOrder: gift.sortOrder.toString(),
          active: gift.active,
        });
      } else {
        reset({
          name: "",
          icon: "🎁",
          category: "感謝",
          costPoints: "",
          sortOrder: "",
          active: true,
        });
      }
      setShowIconPicker(false);
    }
  }, [open, gift, reset]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await upsertGiftCatalog({
        id: gift?.id,
        name: data.name,
        icon: data.icon || null,
        category: data.category,
        costPoints: parseInt(data.costPoints, 10),
        sortOrder: data.sortOrder ? parseInt(data.sortOrder, 10) : 0,
        active: data.active,
      });

      if (result.ok) {
        showToast(gift ? "ギフトを更新しました" : "ギフトを追加しました", "success");
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
              {gift ? "ギフトを編集" : "新しいギフトを追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Name with Icon */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  ギフト名とアイコン <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex gap-2">
                  {/* Icon Picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      className="flex h-10 w-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-2xl hover:bg-white focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta transition-colors"
                    >
                      {selectedIcon || "🎁"}
                    </button>
                    {showIconPicker && (
                      <div className="absolute left-0 top-full z-10 mt-2 grid w-64 grid-cols-6 gap-2 rounded-xl border border-stone-200 bg-white p-3 shadow-soft-lg">
                        {commonIcons.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => {
                              setValue("icon", icon);
                              setShowIconPicker(false);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-stone-100 transition-colors"
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    {...register("name")}
                    className="block flex-1 rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: コーヒー1杯"
                  />
                </div>
                {errors.name && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.name.message}</p>
                )}
              </div>

              {/* Category */}
              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-bold text-stone-700"
                >
                  カテゴリ <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5">
                  <Controller
                    control={control}
                    name="category"
                    render={({ field }) => (
                      <Select
                        id="category"
                        aria-label="カテゴリ"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="選択してください"
                        options={categoryOptions.map((o) => ({ value: o.value, label: o.label }))}
                      />
                    )}
                  />
                </div>
                {errors.category && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.category.message}</p>
                )}
              </div>

              {/* Cost Points */}
              <div>
                <label
                  htmlFor="costPoints"
                  className="block text-sm font-bold text-stone-700"
                >
                  必要ポイント <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="costPoints"
                    type="number"
                    {...register("costPoints")}
                    className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 300"
                    min="1"
                  />
                  <span className="text-sm font-bold text-stone-500">pt</span>
                </div>
                {errors.costPoints && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.costPoints.message}</p>
                )}
              </div>

              {/* Sort Order */}
              <div>
                <label
                  htmlFor="sortOrder"
                  className="block text-sm font-bold text-stone-700"
                >
                  表示順
                </label>
                <input
                  id="sortOrder"
                  type="number"
                  {...register("sortOrder")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="例: 1"
                  min="0"
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  数字が小さいほど上に表示されます（空欄は0扱い）
                </p>
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
                {submitting ? "保存中..." : gift ? "更新" : "追加"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
