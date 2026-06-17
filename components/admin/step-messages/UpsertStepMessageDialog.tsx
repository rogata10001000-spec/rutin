"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  upsertStepMessage,
  uploadStepImage,
  type StepMessage,
} from "@/actions/admin/step-messages";
import { upsertStepMessageSchema, type StepTrigger } from "@/schemas/step-messages";
import { useToast } from "@/components/common/Toast";
import { Select } from "@/components/common/Select";

const TRIGGER_OPTIONS = [
  { value: "follow", label: "友だち追加から（通常のステップ配信）" },
  { value: "checkout_abandoned", label: "カゴ落ち（決済開始後・未完了）から" },
] as const;

type UpsertStepMessageDialogProps = {
  open: boolean;
  editItem: StepMessage | null;
  onClose: () => void;
};

type FieldErrors = {
  stepOrder?: string;
  delayHours?: string;
  body?: string;
};

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta";

export function UpsertStepMessageDialog({ open, editItem, onClose }: UpsertStepMessageDialogProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [trigger, setTrigger] = useState<StepTrigger>("follow");
  const [stepOrder, setStepOrder] = useState("1");
  const [delayHours, setDelayHours] = useState("24");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setErrors({});
      if (editItem) {
        setTrigger(editItem.trigger);
        setStepOrder(String(editItem.stepOrder));
        setDelayHours(String(editItem.delayHours));
        setTitle(editItem.title ?? "");
        setBody(editItem.body);
        setImageUrl(editItem.imageUrl ?? "");
        setActive(editItem.active);
      } else {
        setTrigger("follow");
        setStepOrder("1");
        setDelayHours("24");
        setTitle("");
        setBody("");
        setImageUrl("");
        setActive(true);
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, editItem]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const input = {
      id: editItem?.id,
      trigger,
      stepOrder: stepOrder ? parseInt(stepOrder, 10) : NaN,
      delayHours: delayHours ? parseInt(delayHours, 10) : NaN,
      title: title.trim() || undefined,
      body,
      imageUrl: imageUrl || undefined,
      active,
    };

    const parsed = upsertStepMessageSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      showToast("入力内容を確認してください", "error");
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsertStepMessage(parsed.data);
      if (result.ok) {
        showToast(editItem ? "更新しました" : "作成しました", "success");
        router.refresh();
        onClose();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("保存に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadStepImage(fd);
      if (result.ok) {
        setImageUrl(result.data.url);
        showToast("画像をアップロードしました", "success");
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("画像のアップロードに失敗しました", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const delayDays = Number(delayHours) > 0 ? Math.round((Number(delayHours) / 24) * 10) / 10 : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative z-50 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg ring-1 ring-stone-900/5"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex-shrink-0 border-b border-stone-100 bg-stone-50/50 px-6 py-4">
            <h3 className="text-lg font-bold text-stone-800">
              {editItem ? "ステップを編集" : "ステップを追加"}
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  配信トリガー <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5">
                  <Select
                    aria-label="配信トリガー"
                    value={trigger}
                    onChange={(v) => setTrigger(v as StepTrigger)}
                    options={TRIGGER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </div>
                <p className="mt-1.5 text-xs text-stone-400">
                  {trigger === "checkout_abandoned"
                    ? "決済を開始したのに完了しなかった人へ、決済開始からの経過時間で送ります。"
                    : "友だち追加した未契約の人へ、追加からの経過時間で送ります。"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-stone-700">
                    配信順 <span className="text-terracotta">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stepOrder}
                    onChange={(e) => setStepOrder(e.target.value)}
                    className={inputClass}
                  />
                  {errors.stepOrder && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">{errors.stepOrder}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700">
                    送信タイミング（時間） <span className="text-terracotta">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={delayHours}
                    onChange={(e) => setDelayHours(e.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    登録から{delayDays > 0 ? `約${delayDays}日後` : "即時"}に送信
                  </p>
                  {errors.delayHours && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">{errors.delayHours}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700">管理用ラベル（任意）</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 登録翌日のフォロー"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700">
                  本文 <span className="text-xs font-medium text-stone-400">（画像のみ送る場合は任意）</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="LINEで送信するメッセージ本文"
                  className={`${inputClass} resize-none`}
                />
                <p className="mt-1.5 text-xs text-stone-400">{body.length} / 2000</p>
                {errors.body && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{errors.body}</p>
                )}
              </div>

              {/* 画像（任意） */}
              <div>
                <label className="block text-sm font-bold text-stone-700">
                  画像 <span className="text-xs font-medium text-stone-400">（任意・最大5MB / JPEG・PNG・WebP・GIF）</span>
                </label>
                {imageUrl ? (
                  <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="配信画像プレビュー"
                      className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      disabled={uploading || submitting}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      画像を削除
                    </button>
                  </div>
                ) : (
                  <label className="mt-1.5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm font-medium text-stone-500 hover:bg-stone-100">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleImageUpload}
                      disabled={uploading || submitting}
                      className="sr-only"
                    />
                    {uploading ? "アップロード中…" : "＋ 画像をアップロード"}
                  </label>
                )}
              </div>

              <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                <div>
                  <span className="block text-sm font-bold text-stone-700">有効</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    オフにすると配信されません
                  </span>
                </div>
                <span className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="peer h-6 w-11 rounded-full bg-stone-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sage peer-checked:after:translate-x-full peer-checked:after:border-white" />
                </span>
              </label>
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-stone-100 bg-stone-50/50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
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
