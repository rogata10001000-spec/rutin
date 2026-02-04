"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { upsertStaffProfile, type StaffMember } from "@/actions/admin/staff";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  displayName: z.string().min(1, "表示名を入力してください").max(50, "表示名は50文字以内で入力してください"),
  role: z.enum(["admin", "supervisor", "cast"]),
  capacityLimit: z.string().optional(),
  active: z.boolean(),
  acceptingNewUsers: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

type EditStaffDialogProps = {
  open: boolean;
  staff: StaffMember | null;
  onClose: () => void;
};

const roleOptions = [
  { value: "cast", label: "キャスト" },
  { value: "supervisor", label: "スーパーバイザー" },
  { value: "admin", label: "管理者" },
] as const;

export function EditStaffDialog({ open, staff, onClose }: EditStaffDialogProps) {
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
      displayName: "",
      role: "cast",
      capacityLimit: "",
      active: true,
      acceptingNewUsers: true,
    },
  });

  const selectedRole = watch("role");

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
    if (open && staff) {
      reset({
        displayName: staff.displayName,
        role: staff.role,
        capacityLimit: staff.capacityLimit?.toString() ?? "",
        active: staff.active,
        acceptingNewUsers: staff.acceptingNewUsers,
      });
    }
  }, [open, staff, reset]);

  const onSubmit = async (data: FormData) => {
    if (!staff) return;

    setSubmitting(true);
    try {
      const result = await upsertStaffProfile({
        staffId: staff.id,
        displayName: data.displayName,
        role: data.role,
        capacityLimit: data.capacityLimit ? parseInt(data.capacityLimit, 10) : null,
        active: data.active,
        acceptingNewUsers: data.acceptingNewUsers,
      });

      if (result.ok) {
        showToast("キャスト情報を更新しました", "success");
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

  if (!open || !staff) return null;

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
              キャスト情報を編集
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {staff.displayName}さんの情報
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Display Name */}
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-sm font-bold text-stone-700"
                >
                  表示名 <span className="text-terracotta">*</span>
                </label>
                <input
                  id="displayName"
                  type="text"
                  {...register("displayName")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                {errors.displayName && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.displayName.message}</p>
                )}
              </div>

              {/* Role */}
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-bold text-stone-700"
                >
                  ロール <span className="text-terracotta">*</span>
                </label>
                <div className="relative mt-1.5">
                  <select
                    id="role"
                    {...register("role")}
                    className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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

              {/* Capacity Limit (Cast only) */}
              {selectedRole === "cast" && (
                <div>
                  <label
                    htmlFor="capacityLimit"
                    className="block text-sm font-bold text-stone-700"
                  >
                    担当上限
                  </label>
                  <input
                    id="capacityLimit"
                    type="number"
                    {...register("capacityLimit")}
                    className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    placeholder="例: 30"
                    min="1"
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    空欄の場合は上限なし（現在の担当: {staff.assignedUserCount}人）
                  </p>
                </div>
              )}

              {/* Active */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-stone-50/50">
                <div>
                  <label
                    htmlFor="active"
                    className="block text-sm font-bold text-stone-700"
                  >
                    アカウント状態
                  </label>
                  <p className="text-xs text-stone-500 mt-0.5">
                    無効にするとログインできなくなります
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

              {/* Accepting New Users (Cast only) */}
              {selectedRole === "cast" && (
                <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4 bg-stone-50/50">
                  <div>
                    <label
                      htmlFor="acceptingNewUsers"
                      className="block text-sm font-bold text-stone-700"
                    >
                      新規受付
                    </label>
                    <p className="text-xs text-stone-500 mt-0.5">
                      停止中は新規ユーザーに表示されません
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      id="acceptingNewUsers"
                      type="checkbox"
                      {...register("acceptingNewUsers")}
                      className="peer sr-only"
                    />
                    <div className="peer h-6 w-11 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-sage/30 transition-colors"></div>
                  </label>
                </div>
              )}
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
