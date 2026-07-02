"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TemplateSelector } from "@/components/chat/TemplateSelector";

type BulkComposeModalProps = {
  count: number;
  onCancel: () => void;
  /** 本文を確定してレビューキューへ進む */
  onProceed: (text: string) => void;
};

/**
 * 同じ内容を複数ユーザーへ送るための本文作成モーダル。
 * {名前} プレースホルダとテンプレートを使い、確認はレビューキュー側で行う。
 */
export function BulkComposeModal({ count, onCancel, onProceed }: BulkComposeModalProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertName = () => {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => `${t}{名前}`);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}{名前}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + "{名前}".length;
      el.setSelectionRange(pos, pos);
    });
  };

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="同じ内容を一斉送信"
        className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-soft-lg sm:max-w-lg sm:rounded-2xl"
      >
        <div className="shrink-0 border-b border-stone-100 bg-stone-50/60 px-5 py-4">
          <h2 className="text-base font-bold text-stone-800">同じ内容を{count}人に送信</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            本文を作成したら、次の画面で1人ずつ確認・調整してから送信できます。
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-5 pb-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            autoFocus
            placeholder={"例: {名前}さん、おはようございます！今日も一緒にいきましょう🔥"}
            className="block min-h-[11rem] w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-900 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>{"{名前}"} は各ユーザーの表示名に置き換わります</span>
            <span className="tabular-nums">{text.length}文字</span>
          </div>
        </div>

        {/* ツールバー（テンプレのポップアップが上方向＝テキストエリア側に開くため、スクロール外に置く） */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-1">
          <TemplateSelector onSelect={(body) => setText(body)} />
          <button
            type="button"
            onClick={insertName}
            className="whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
          >
            {"{名前}"}を挿入
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-100 bg-white px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onProceed(text)}
            disabled={!text.trim()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            下書きを確認へ
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
