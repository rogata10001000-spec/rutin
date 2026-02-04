"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { updateEndUser, type UserDetail } from "@/actions/users";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  nickname: z.string().min(1, "ニックネームを入力してください").max(50, "ニックネームは50文字以内で入力してください"),
  birthday: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

type EditUserDialogProps = {
  open: boolean;
  user: UserDetail | null;
  onClose: () => void;
};

export function EditUserDialog({ open, user, onClose }: EditUserDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nickname: "",
      birthday: "",
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
    if (open && user) {
      reset({
        nickname: user.nickname,
        birthday: user.birthday ?? "",
      });
      setTags(user.tags ?? []);
      setTagInput("");
    }
  }, [open, user, reset]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    setSubmitting(true);
    try {
      const result = await updateEndUser({
        endUserId: user.id,
        nickname: data.nickname,
        birthday: data.birthday || null,
        tags,
      });

      if (result.ok) {
        showToast("ユーザー情報を更新しました", "success");
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
              ユーザー情報を編集
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {user.nickname}さんのプロフィール情報
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* Nickname */}
              <div>
                <label
                  htmlFor="nickname"
                  className="block text-sm font-bold text-stone-700"
                >
                  ニックネーム <span className="text-terracotta">*</span>
                </label>
                <input
                  id="nickname"
                  type="text"
                  {...register("nickname")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                {errors.nickname && (
                  <p className="mt-1.5 text-sm text-red-600 font-medium">{errors.nickname.message}</p>
                )}
              </div>

              {/* Birthday */}
              <div>
                <label
                  htmlFor="birthday"
                  className="block text-sm font-bold text-stone-700"
                >
                  誕生日
                </label>
                <input
                  id="birthday"
                  type="date"
                  {...register("birthday")}
                  className="mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                <p className="mt-1.5 text-xs text-stone-400">
                  誕生日を設定するとお祝いメッセージを送る際に通知されます
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  タグ
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="タグを入力してEnter"
                    className="flex-1 rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    maxLength={30}
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim() || tags.length >= 10}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">
                  最大10個まで（{tags.length}/10）
                </p>

                {/* Tag list */}
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Read-only info */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <h4 className="mb-3 text-sm font-bold text-stone-700">その他の情報</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-stone-500">LINE User ID</dt>
                    <dd className="font-mono text-stone-700">{user.lineUserId.slice(0, 16)}...</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">プラン</dt>
                    <dd className="text-stone-700 font-medium">{user.planCode}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-stone-500">担当キャスト</dt>
                    <dd className="text-stone-700 font-medium">{user.assignedCastName ?? "未割当"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-stone-400">
                  プラン・担当キャストは別の画面から変更してください
                </p>
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
