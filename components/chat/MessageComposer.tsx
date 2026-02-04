"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AiDraftButton } from "./AiDraftButton";
import { BirthdayWidget } from "./BirthdayWidget";
import { ShadowDraftButton } from "./ShadowDraftButton";
import { SaveStatus } from "@/components/common/SaveStatus";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

type MessageComposerProps = {
  onSend: (body: string) => Promise<void>;
  sending: boolean;
  proxyMode: boolean;
  endUserId: string;
  showBirthdayWidget?: boolean;
  showShadowDraft?: boolean;
};

// localStorage key for draft
const getDraftKey = (endUserId: string) => `chat_draft_${endUserId}`;

export function MessageComposer({
  onSend,
  sending,
  proxyMode,
  endUserId,
  showBirthdayWidget = true,
  showShadowDraft = true,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 初期化時にlocalStorageから下書きを復元
  useEffect(() => {
    const savedDraft = localStorage.getItem(getDraftKey(endUserId));
    if (savedDraft) {
      setBody(savedDraft);
    }
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

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!body.trim() || sending) return;

    await onSend(body.trim());
    setBody("");
    // 送信後は下書きをクリア
    localStorage.removeItem(getDraftKey(endUserId));
    setSaveStatus("idle");
  }, [body, sending, onSend, endUserId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Cmd/Ctrl + S で送信
  useKeyboardShortcut("s", () => {
    if (body.trim() && !sending) {
      handleSubmit();
    }
  }, { meta: true, enableInInput: true });

  return (
    <form onSubmit={handleSubmit} className="border-t border-stone-200 bg-white p-4">
      {/* Birthday Widget */}
      {showBirthdayWidget && (
        <BirthdayWidget
          endUserId={endUserId}
          onInsertTemplate={(text) => setBody(text)}
        />
      )}

      {/* Shadow Draft (for shadow period casts) */}
      {showShadowDraft && (
        <ShadowDraftButton
          endUserId={endUserId}
          currentBody={body}
          onClearBody={() => setBody("")}
        />
      )}

      {proxyMode && (
        <div className="mb-3 rounded-xl bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 border border-purple-100 flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          代理返信モード: 送信時に確認ダイアログが表示されます
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AiDraftButton
            endUserId={endUserId}
            onSelectDraft={(draft) => setBody(draft)}
          />
        </div>
        <SaveStatus status={saveStatus} className="text-xs" />
      </div>
      <div className="flex gap-3">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力... (Shift+Enterで改行, Cmd+Sで送信)"
          rows={2}
          className="flex-1 resize-none rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta transition-all"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!body.trim() || sending}
          className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
            proxyMode
              ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
              : "bg-terracotta hover:bg-[#d0694e] focus:ring-terracotta"
          }`}
        >
          {sending ? "送信中..." : "送信"}
        </button>
      </div>
    </form>
  );
}
