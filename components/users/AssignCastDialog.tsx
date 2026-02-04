"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { UserDetail } from "@/actions/users";
import { getCastOptions, assignCast, type CastOption } from "@/actions/assignments";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  toCastId: z.string().uuid("キャストを選択してください"),
  reason: z.string().min(1, "理由を入力してください").max(200, "200文字以内で入力してください"),
  shadowUntil: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

type AssignCastDialogProps = {
  open: boolean;
  user: UserDetail | null;
  onClose: () => void;
};

export function AssignCastDialog({ open, user, onClose }: AssignCastDialogProps) {
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
      toCastId: "",
      reason: "",
      shadowUntil: "",
    },
  });

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      loadCasts();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      reset({
        toCastId: "",
        reason: "",
        shadowUntil: "",
      });
    }
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
    if (!user) return;

    setSubmitting(true);
    try {
      const result = await assignCast({
        endUserId: user.id,
        toCastId: data.toCastId,
        reason: data.reason,
        shadowUntil: data.shadowUntil || undefined,
      });

      if (result.ok) {
        showToast("担当を変更しました", "success");
        onClose();
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("担当変更に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !user) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Dialog */}
        <div
          className="relative z-50 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-stone-900/5"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex-shrink-0 border-b border-stone-100 bg-stone-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-stone-800">
              担当キャスト変更
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {user.nickname}さんの担当を変更
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Current Cast Info */}
              <div className="rounded-xl bg-stone-50 p-4 border border-stone-100">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">現在の担当</p>
                <p className="mt-1 font-bold text-stone-800 text-lg">
                  {user.assignedCastName ?? "未割当"}
                </p>
              </div>

              {/* Cast Selection */}
              <div>
                <label
                  htmlFor="toCastId"
                  className="block text-sm font-bold text-stone-700"
                >
                  新しい担当 <span className="text-terracotta">*</span>
                </label>
                {loadingCasts ? (
                  <div className="mt-1.5 animate-pulse">
                    <div className="h-10 rounded-xl bg-stone-200" />
                  </div>
                ) : (
                  <div className="relative mt-1.5">
                    <select
                      id="toCastId"
                      {...register("toCastId")}
                      className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    >
                      <option value="">キャストを選択...</option>
                      {casts
                        .filter((c) => c.id !== user.assignedCastId)
                        .map((cast) => {
                          const isAtCapacity =
                            cast.capacityLimit !== null &&
                            cast.assignedUserCount >= cast.capacityLimit;
                          return (
                            <option
                              key={cast.id}
                              value={cast.id}
                              disabled={isAtCapacity}
                            >
                              {cast.displayName}
                              {" "}({cast.assignedUserCount}
                              {cast.capacityLimit ? `/${cast.capacityLimit}` : ""}人)
                              {!cast.acceptingNewUsers && " [受付停止中]"}
                              {isAtCapacity && " [上限到達]"}
                            </option>
                          );
                        })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}
                {errors.toCastId && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.toCastId.message}</p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label
                  htmlFor="reason"
                  className="block text-sm font-bold text-stone-700"
                >
                  変更理由 <span className="text-terracotta">*</span>
                </label>
                <textarea
                  id="reason"
                  {...register("reason")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  rows={3}
                  maxLength={200}
                  placeholder="変更の理由を入力してください..."
                />
                {errors.reason && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.reason.message}</p>
                )}
              </div>

              {/* Shadow Until */}
              <div>
                <label
                  htmlFor="shadowUntil"
                  className="block text-sm font-bold text-stone-700"
                >
                  Shadow期間終了日（任意）
                </label>
                <input
                  id="shadowUntil"
                  type="date"
                  {...register("shadowUntil")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  min={new Date().toISOString().split("T")[0]}
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  設定すると、指定日まで前任キャストも閲覧・下書きが可能になります
                </p>
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
                    担当変更後、すぐにユーザーのチャット画面や通知が新しい担当に切り替わります。
                  </p>
                </div>
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
                {submitting ? "変更中..." : "変更する"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
