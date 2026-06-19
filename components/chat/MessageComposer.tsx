"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AiDraftButton } from "./AiDraftButton";
import { BirthdayWidget } from "./BirthdayWidget";
import { TemplateSelector } from "./TemplateSelector";
import { SaveStatus } from "@/components/common/SaveStatus";

type MessageComposerProps = {
  onSend: (body: string) => Promise<void>;
  sending: boolean;
  proxyMode: boolean;
  endUserId: string;
  showBirthdayWidget?: boolean;
};

// localStorage key for draft
const getDraftKey = (endUserId: string) => `chat_draft_${endUserId}`;

const MAX_TEXTAREA_HEIGHT = 200; // px（約8行）

export function MessageComposer({
  onSend,
  sending,
  proxyMode,
  endUserId,
  showBirthdayWidget = true,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // テキストエリアの高さを内容に合わせて自動調整
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  // 値の変更（下書き復元含む）に追従して高さを調整
  useEffect(() => {
    autoResize();
  }, [body, autoResize]);

  // 初期化時にlocalStorageから下書きを復元
  useEffect(() => {
    const savedDraft = localStorage.getItem(getDraftKey(endUserId));
    setBody(savedDraft ?? "");
  }, [endUserId]);

  // 下書きの自動保存（デバウンス）
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 空の場合は保存しない（クリアする）
    if (!body.trim()) {
      localStorage.removeItem(getDraftKey(endUserId));
      setSaveStatus("idle");
      return;
    }

    setSaveStatus("idle");
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus("saving");
      try {
        localStorage.setItem(getDraftKey(endUserId), body);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [body, endUserId]);

  // 未保存時の離脱警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (body.trim()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [body]);

  const handleSubmit = useCallback(async () => {
    if (!body.trim() || sending) return;

    await onSend(body.trim());
    setBody("");
    // 送信後は下書きをクリア
    localStorage.removeItem(getDraftKey(endUserId));
    setSaveStatus("idle");
  }, [body, sending, onSend, endUserId]);

  // ⌘/Ctrl + Enter で送信
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const charCount = body.length;

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="border-t border-stone-200 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      {/* Birthday Widget */}
      {showBirthdayWidget && (
        <BirthdayWidget
          endUserId={endUserId}
          onInsertTemplate={(text) => setBody(text)}
        />
      )}

      {proxyMode && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700">
          <span className="text-lg">⚠️</span>
          代理返信モード: 送信時に確認ダイアログが表示されます
        </div>
      )}

      {/* ツールバー（テンプレ・AI返信案・保存状態） */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AiDraftButton
            endUserId={endUserId}
            onSelectDraft={(draft) => setBody(draft)}
          />
          <TemplateSelector onSelect={(text) => setBody(text)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden whitespace-nowrap text-[11px] text-stone-400 sm:inline">
            ⌘/Ctrl + Enter で送信
          </span>
          <SaveStatus status={saveStatus} className="text-xs" />
        </div>
      </div>

      <div className="flex items-end gap-2 sm:gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力…"
            rows={2}
            className="block max-h-[200px] w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 pb-6 text-sm text-stone-900 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
            disabled={sending}
          />
          {charCount > 0 && (
            <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-stone-400">
              {charCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || sending}
          aria-label="送信"
          className={`inline-flex min-h-[2.75rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:px-5 ${
            proxyMode
              ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
              : "bg-terracotta hover:bg-[#d0694e] focus:ring-terracotta"
          }`}
        >
          {sending ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
          <span className="hidden sm:inline">{sending ? "送信中…" : "送信"}</span>
        </button>
      </div>
    </form>
  );
}
