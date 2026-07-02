"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { bulkAddTag } from "@/actions/users";
import { useToast } from "@/components/common/Toast";

type BulkTagModalProps = {
  count: number;
  endUserIds: string[];
  availableTags: string[];
  onClose: (didUpdate: boolean) => void;
};

/** 選択中ユーザーへタグを一括追加（Admin/Supervisor）。 */
export function BulkTagModal({ count, endUserIds, availableTags, onClose }: BulkTagModalProps) {
  const { showToast, ToastContainer } = useToast();
  const [tag, setTag] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const result = await bulkAddTag({ endUserIds, tag: trimmed });
    setSubmitting(false);
    if (result.ok) {
      showToast(`${result.data.updated}人にタグ「${trimmed}」を追加しました`, "success");
      onClose(true);
    } else {
      showToast(result.error.message, "error");
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => onClose(false)} />

      <div className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-soft-lg sm:max-w-md sm:rounded-2xl">
        <h2 className="text-base font-bold text-stone-800">{count}人にタグを追加</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          既に同じタグを持つユーザーには重複追加されません。
        </p>

        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          maxLength={20}
          autoFocus
          placeholder="例: 7月キャンペーン"
          className="mt-3 block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
        />

        {availableTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableTags.slice(0, 10).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  tag === t
                    ? "border-terracotta bg-terracotta/10 text-terracotta"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!tag.trim() || submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "追加中…" : "タグを追加"}
          </button>
        </div>
      </div>
      <ToastContainer />
    </div>
  );

  return createPortal(modal, document.body);
}
