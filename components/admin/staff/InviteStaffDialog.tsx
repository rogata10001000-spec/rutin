"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createStaffAccount } from "@/actions/admin/staff";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  displayName: z.string().min(1, "表示名を入力してください").max(50, "表示名は50文字以内で入力してください"),
  capacityLimit: z.string().optional(),
  gender: z.enum(["female", "male", "other", ""]).optional(),
  birthDate: z.string().optional(),
  publicProfile: z.string().max(1000, "1000文字以内で入力してください").optional(),
});

type FormData = z.infer<typeof formSchema>;

const genderOptions = [
  { value: "", label: "未設定" },
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "other", label: "その他" },
] as const;

type InviteStaffDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function InviteStaffDialog({ open, onClose }: InviteStaffDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      displayName: "",
      capacityLimit: "",
      gender: "",
      birthDate: "",
      publicProfile: "",
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
    if (!open) {
      reset();
      setCreatedAccount(null);
    }
  }, [open, reset]);

  const handleClose = () => {
    setCreatedAccount(null);
    onClose();
  };

  const handleCopyPassword = async () => {
    if (!createdAccount) return;

    try {
      await navigator.clipboard.writeText(createdAccount.temporaryPassword);
      showToast("初期パスワードをコピーしました", "success");
    } catch {
      showToast("コピーに失敗しました。手動で控えてください", "error");
    }
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await createStaffAccount({
        email: data.email,
        displayName: data.displayName,
        role: "cast",
        capacityLimit: data.capacityLimit ? parseInt(data.capacityLimit, 10) : null,
        gender: data.gender ? data.gender : null,
        birthDate: data.birthDate ? data.birthDate : null,
        publicProfile: data.publicProfile?.trim() ? data.publicProfile.trim() : null,
      });

      if (result.ok) {
        setCreatedAccount({
          email: result.data.email,
          temporaryPassword: result.data.temporaryPassword,
        });
        showToast(`${data.displayName}さんのアカウントを作成しました`, "success");
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("アカウント作成に失敗しました", "error");
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
          onClick={handleClose}
        />

        <div
          className="relative z-50 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-stone-900/5"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex-shrink-0 border-b border-stone-100 bg-stone-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-stone-800">
              {createdAccount ? "初期パスワードを確認" : "キャストアカウントを作成"}
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {createdAccount
                ? "このパスワードは閉じると再表示できません"
                : "作成後、初期パスワードを一度だけ表示します"}
            </p>
          </div>

          {createdAccount ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">
                    初期パスワードをキャスト本人へ安全に共有してください
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    システム上では平文パスワードを保存していないため、閉じた後は再表示できません。
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold text-stone-700">メールアドレス</p>
                  <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900">
                    {createdAccount.email}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold text-stone-700">初期パスワード</p>
                  <div className="mt-1.5 flex gap-2">
                    <code className="flex-1 rounded-xl border border-stone-200 bg-stone-900 px-4 py-2.5 text-sm font-bold text-white">
                      {createdAccount.temporaryPassword}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2"
                    >
                      コピー
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 justify-end border-t border-stone-100 bg-stone-50/50 px-6 py-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
                >
                  確認して閉じる
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-bold text-stone-700"
                >
                  メールアドレス <span className="text-terracotta">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="example@email.com"
                />
                {errors.email && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.email.message}</p>
                )}
              </div>

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
                  placeholder="山田太郎"
                />
                {errors.displayName && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.displayName.message}</p>
                )}
              </div>

              {/* Capacity Limit */}
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
                  空欄の場合は上限なし
                </p>
              </div>

              {/* Gender */}
              <div>
                <label
                  htmlFor="gender"
                  className="block text-sm font-bold text-stone-700"
                >
                  性別
                </label>
                <div className="relative mt-1.5">
                  <select
                    id="gender"
                    {...register("gender")}
                    className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  >
                    {genderOptions.map((option) => (
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
                <p className="mt-1.5 text-xs text-stone-400">
                  ユーザーの伴走メイト選択画面で絞り込みに使われます
                </p>
              </div>

              {/* Birth Date */}
              <div>
                <label
                  htmlFor="birthDate"
                  className="block text-sm font-bold text-stone-700"
                >
                  生年月日
                </label>
                <input
                  id="birthDate"
                  type="date"
                  {...register("birthDate")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  年齢のみがユーザー画面に表示されます
                </p>
              </div>

              {/* Public Profile */}
              <div>
                <label
                  htmlFor="publicProfile"
                  className="block text-sm font-bold text-stone-700"
                >
                  ユーザー向けプロフィール
                </label>
                <textarea
                  id="publicProfile"
                  rows={4}
                  {...register("publicProfile")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                  placeholder="自己紹介、得意な相談ジャンルなど（1000文字以内）"
                />
                {errors.publicProfile && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.publicProfile.message}</p>
                )}
                <p className="mt-1.5 text-xs text-stone-400">
                  伴走メイト選択画面の詳細モーダルで表示されます
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
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
                {submitting ? "作成中..." : "アカウントを作成"}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
