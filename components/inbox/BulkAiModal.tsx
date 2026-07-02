"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

type BulkAiModalProps = {
  count: number;
  onCancel: () => void;
  /** 生成を開始してレビューキューへ進む */
  onStart: (instruction: string | undefined) => void;
};

/**
 * AI一括下書きの開始モーダル。共通の指示（任意）を添えて生成をはじめる。
 * 生成そのものはレビューキュー側で1人ずつ進み、終わった人から確認できる。
 */
export function BulkAiModal({ count, onCancel, onStart }: BulkAiModalProps) {
  const [instruction, setInstruction] = useState("");

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="AIで下書きを一括生成"
        className="relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-soft-lg sm:max-w-lg sm:rounded-2xl"
      >
        <div className="shrink-0 border-b border-stone-100 bg-stone-50/60 px-5 py-4">
          <h2 className="text-base font-bold text-stone-800">AIで下書きを一括生成（{count}人）</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            それぞれの会話履歴・ピン留めメモ・チェックインをもとに、1人ずつ別の下書きを作成します。
            送信前に必ず1人ずつ内容を確認できます。
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-5">
          <label htmlFor="bulk-ai-instruction" className="text-sm font-bold text-stone-700">
            全員に共通の指示 <span className="font-normal text-stone-400">（任意）</span>
          </label>
          <textarea
            id="bulk-ai-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            maxLength={200}
            autoFocus
            placeholder="例: 週末の過ごし方をひとこと聞いてみて／新しい月の目標づくりを促して"
            className="block w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-900 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          <p className="text-[11px] text-stone-400">
            生成は1人ずつ順番に進みます（完了した人から先に確認できます）。人数が多いと数十秒〜数分かかります。
          </p>
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
            onClick={() => onStart(instruction.trim() || undefined)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e]"
          >
            <span aria-hidden>✨</span>
            生成をはじめる
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
