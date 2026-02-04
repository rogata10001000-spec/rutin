"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createEndUser } from "@/actions/users";
import { getCastOptions, type CastOption } from "@/actions/assignments";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  lineUserId: z.string().min(1, "LINE User IDを入力してください"),
  nickname: z.string().min(1, "ニックネームを入力してください").max(50, "ニックネームは50文字以内で入力してください"),
  planCode: z.enum(["light", "standard", "premium"]),
  assignedCastId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const PLAN_OPTIONS = [
  { value: "light", label: "ライト" },
  { value: "standard", label: "スタンダード" },
  { value: "premium", label: "プレミアム" },
] as const;

type CreateUserDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [casts, setCasts] = useState<CastOption[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      lineUserId: "",
      nickname: "",
      planCode: "standard",
      assignedCastId: "",
    },
  });

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      loadCasts();
      reset({
        lineUserId: "",
        nickname: "",
        planCode: "standard",
        assignedCastId: "",
      });
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, reset]);

  const loadCasts = async () => {
    setLoadingCasts(true);
    const result = await getCastOptions();
    if (result.ok) {
      setCasts(result.data.casts);
    }
    setLoadingCasts(false);
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await createEndUser({
        lineUserId: data.lineUserId,
        nickname: data.nickname,
        planCode: data.planCode,
        assignedCastId: data.assignedCastId || undefined,
      });

      if (result.ok) {
        showToast("ユーザーを作成しました", "success");
        onClose();
        router.push(`/users/${result.data.id}`);
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("作成に失敗しました", "error");
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
              ユーザーを追加
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              テスト・運用用にLINE経由以外でユーザーを作成します
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* LINE User ID */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  LINE User ID <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  {...register("lineUserId")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 font-mono text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="U1234567890abcdef..."
                />
                {errors.lineUserId && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.lineUserId.message}</p>
                )}
                <p className="mt-1.5 text-xs text-stone-400">
                  テスト用の場合は「test_」で始まるIDを推奨
                </p>
              </div>

              {/* Nickname */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  ニックネーム <span className="text-terracotta">*</span>
                </label>
                <input
                  type="text"
                  {...register("nickname")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="ユーザーの表示名"
                />
                {errors.nickname && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.nickname.message}</p>
                )}
              </div>

              {/* Plan */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  プラン <span className="text-terracotta">*</span>
                </label>
                <div className="relative mt-1.5">
                  <select
                    {...register("planCode")}
                    className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
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

              {/* Assigned Cast */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  担当キャスト（任意）
                </label>
                {loadingCasts ? (
                  <div className="mt-1.5 animate-pulse">
                    <div className="h-10 rounded-xl bg-stone-200" />
                  </div>
                ) : (
                  <div className="relative mt-1.5">
                    <select
                      {...register("assignedCastId")}
                      className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    >
                      <option value="">未割当</option>
                      {casts.map((cast) => (
                        <option key={cast.id} value={cast.id}>
                          {cast.displayName} ({cast.assignedUserCount}
                          {cast.capacityLimit ? `/${cast.capacityLimit}` : ""}人)
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Warning */}
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 text-yellow-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-sm text-yellow-800 font-medium">
                    手動作成されたユーザーはStripe連携なしで即時有効になります。
                    本番環境では運用・テスト目的のみで使用してください。
                  </p>
                </div>
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
                {submitting ? "作成中..." : "作成"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
