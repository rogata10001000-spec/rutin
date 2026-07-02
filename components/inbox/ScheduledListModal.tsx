"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  listMyScheduledMessages,
  cancelScheduledMessage,
  type ScheduledMessageItem,
} from "@/actions/scheduled-messages";
import { useToast } from "@/components/common/Toast";

type ScheduledListModalProps = {
  onClose: (changed: boolean) => void;
};

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 自分の予約送信（pending）一覧と取り消し。 */
export function ScheduledListModal({ onClose }: ScheduledListModalProps) {
  const { showToast, ToastContainer } = useToast();
  const [items, setItems] = useState<ScheduledMessageItem[] | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    void listMyScheduledMessages().then((result) => {
      setItems(result.ok ? result.data.items : []);
      if (!result.ok) showToast(result.error.message, "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    const result = await cancelScheduledMessage({ id });
    setCancelingId(null);
    if (result.ok) {
      setItems((prev) => (prev ?? []).filter((it) => it.id !== id));
      setChanged(true);
      showToast("予約を取り消しました", "success");
    } else {
      showToast(result.error.message, "error");
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => onClose(changed)} />

      <div className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-soft-lg sm:max-w-lg sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 bg-stone-50/60 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-800">予約中の送信</h2>
            <p className="mt-0.5 text-xs text-stone-500">送信前ならいつでも取り消せます</p>
          </div>
          <button
            type="button"
            onClick={() => onClose(changed)}
            aria-label="閉じる"
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {items === null ? (
            <p className="p-6 text-center text-sm text-stone-400">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-stone-400">
              予約中の送信はありません。まとめて送信の確認画面から「予約して送信」で登録できます。
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-bold text-stone-800">{it.displayName}</span>
                      <span className="whitespace-nowrap rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                        {formatJst(it.scheduledAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-500">{it.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCancel(it.id)}
                    disabled={cancelingId === it.id}
                    className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelingId === it.id ? "取消中…" : "取り消す"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ToastContainer />
    </div>
  );

  return createPortal(modal, document.body);
}
