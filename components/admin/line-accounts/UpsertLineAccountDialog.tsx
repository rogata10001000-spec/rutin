"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  upsertLineAccount,
  type LineAccountListItem,
  type CastOptionItem,
} from "@/actions/admin/line-accounts";
import { useToast } from "@/components/common/Toast";

const formSchema = z.object({
  name: z.string().min(1, "表示名を入力してください").max(100),
  isDefault: z.boolean(),
  castId: z.string(),
  channelId: z.string(),
  botUserId: z.string(),
  channelSecret: z.string(),
  channelAccessToken: z.string(),
  liffId: z.string(),
  richMenuUncontractedId: z.string(),
  richMenuContractedId: z.string(),
  friendAddUrl: z.string(),
  active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

type UpsertLineAccountDialogProps = {
  open: boolean;
  editItem: LineAccountListItem | null;
  castOptions: CastOptionItem[];
  encryptionConfigured: boolean;
  onClose: () => void;
};

const inputClass =
  "mt-1.5 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta";

export function UpsertLineAccountDialog({
  open,
  editItem,
  castOptions,
  encryptionConfigured,
  onClose,
}: UpsertLineAccountDialogProps) {
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
      isDefault: false,
      castId: "",
      channelId: "",
      botUserId: "",
      channelSecret: "",
      channelAccessToken: "",
      liffId: "",
      richMenuUncontractedId: "",
      richMenuContractedId: "",
      friendAddUrl: "",
      active: true,
    },
  });

  const isDefault = watch("isDefault");

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
    if (!open) return;
    if (editItem) {
      reset({
        name: editItem.name,
        isDefault: editItem.isDefault,
        castId: editItem.castId ?? "",
        channelId: editItem.channelId ?? "",
        botUserId: editItem.botUserId ?? "",
        channelSecret: "",
        channelAccessToken: "",
        liffId: editItem.liffId ?? "",
        richMenuUncontractedId: editItem.richMenuUncontractedId ?? "",
        richMenuContractedId: editItem.richMenuContractedId ?? "",
        friendAddUrl: editItem.friendAddUrl ?? "",
        active: editItem.active,
      });
    } else {
      reset({
        name: "",
        isDefault: false,
        castId: "",
        channelId: "",
        botUserId: "",
        channelSecret: "",
        channelAccessToken: "",
        liffId: "",
        richMenuUncontractedId: "",
        richMenuContractedId: "",
        friendAddUrl: "",
        active: true,
      });
    }
  }, [open, editItem, reset]);

  const onSubmit = async (data: FormData) => {
    if (!data.isDefault && !data.castId) {
      showToast("メイト個別アカウントは担当メイトを選択してください", "error");
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsertLineAccount({
        id: editItem?.id,
        name: data.name,
        isDefault: data.isDefault,
        castId: data.isDefault ? null : data.castId || null,
        channelId: data.channelId || undefined,
        botUserId: data.botUserId || undefined,
        channelSecret: data.channelSecret || undefined,
        channelAccessToken: data.channelAccessToken || undefined,
        liffId: data.isDefault ? data.liffId || undefined : undefined,
        richMenuUncontractedId: data.isDefault
          ? data.richMenuUncontractedId || undefined
          : undefined,
        richMenuContractedId: data.isDefault
          ? data.richMenuContractedId || undefined
          : undefined,
        friendAddUrl: data.friendAddUrl || undefined,
        active: data.active,
      });

      if (result.ok) {
        showToast(editItem ? "アカウントを更新しました" : "アカウントを作成しました", "success");
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
          className="relative z-50 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-stone-900/5"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex-shrink-0 border-b border-stone-100 bg-stone-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-stone-800">
              {editItem ? "LINE公式アカウントを編集" : "LINE公式アカウントを追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {/* 表示名 */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  表示名 <span className="text-terracotta">*</span>
                </label>
                <input type="text" {...register("name")} className={inputClass} placeholder="例: メイトA 公式LINE" />
                {errors.name && (
                  <p className="mt-1.5 text-sm font-medium text-red-600">{errors.name.message}</p>
                )}
              </div>

              {/* 共通アカウント */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700">共通(デフォルト)アカウント</label>
                  <p className="mt-0.5 text-xs text-stone-500">
                    契約導線・フォールバックに使う共通アカウント。有効なものは1件のみ。
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" {...register("isDefault")} className="peer sr-only" />
                  <div className="peer h-6 w-11 rounded-full bg-stone-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white" />
                </label>
              </div>

              {/* 担当メイト */}
              {!isDefault && (
                <div>
                  <label htmlFor="castId" className="block text-sm font-bold text-stone-700">
                    担当メイト <span className="text-terracotta">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <select
                      id="castId"
                      {...register("castId")}
                      className="block w-full appearance-none rounded-xl border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
                    >
                      <option value="">メイトを選択...</option>
                      {castOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
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
              )}

              {/* チャネル資格情報 */}
              <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                <p className="text-sm font-bold text-stone-700">チャネル資格情報</p>
                {!encryptionConfigured && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    暗号化鍵が未設定のため、シークレット・トークンは保存できません。
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-stone-600">チャネルID</label>
                  <input type="text" {...register("channelId")} className={inputClass} placeholder="任意" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600">
                    ボットユーザーID（destination）
                  </label>
                  <input type="text" {...register("botUserId")} className={inputClass} placeholder="任意（Uxxxx...）" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600">
                    チャネルシークレット
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...register("channelSecret")}
                    className={inputClass}
                    placeholder={editItem?.hasChannelSecret ? "設定済（変更する場合のみ入力）" : "未設定"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600">
                    チャネルアクセストークン
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...register("channelAccessToken")}
                    className={inputClass}
                    placeholder={editItem?.hasAccessToken ? "設定済（変更する場合のみ入力）" : "未設定"}
                  />
                </div>
              </div>

              {/* 友だち追加URL */}
              <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                <p className="text-sm font-bold text-stone-700">友だち追加案内</p>
                <div>
                  <label className="block text-sm font-medium text-stone-600">友だち追加URL</label>
                  <input type="text" {...register("friendAddUrl")} className={inputClass} placeholder="https://lin.ee/xxxx" />
                </div>
                <p className="text-xs leading-5 text-stone-500">
                  メイト個別LINEではリッチメニューを設定しません。契約変更や解約は共通Rutin公式LINEのリッチメニューから行います。
                </p>
              </div>

              {/* 共通LINE用メニュー */}
              {isDefault && (
                <div className="space-y-4 rounded-xl border border-stone-200 p-4">
                  <p className="text-sm font-bold text-stone-700">
                    共通Rutin公式LINEのリッチメニュー
                  </p>
                <div>
                  <label className="block text-sm font-medium text-stone-600">LIFF ID</label>
                  <input type="text" {...register("liffId")} className={inputClass} placeholder="任意" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600">
                    リッチメニューID（未契約）
                  </label>
                  <input type="text" {...register("richMenuUncontractedId")} className={inputClass} placeholder="任意" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600">
                    リッチメニューID（契約済）
                  </label>
                  <input type="text" {...register("richMenuContractedId")} className={inputClass} placeholder="任意" />
                </div>
              </div>
              )}

              {/* 有効 */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700">有効</label>
                  <p className="mt-0.5 text-xs text-stone-500">無効にすると送受信に使われません</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" {...register("active")} className="peer sr-only" />
                  <div className="peer h-6 w-11 rounded-full bg-stone-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white" />
                </label>
              </div>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="whitespace-nowrap rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:opacity-50"
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
