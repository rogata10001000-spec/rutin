"use client";

import { useState, useRef, useEffect } from "react";
import type { Message, ChatSideInfo } from "@/actions/chat";
import type { StaffRole } from "@/lib/supabase/types";
import { sendMessage, sendProxyMessage } from "@/actions/messages";
import { ChatHistory } from "./ChatHistory";
import { MessageComposer } from "./MessageComposer";
import { ChatSidePanel } from "./ChatSidePanel";
import { useToast } from "@/components/common/Toast";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

type ChatContainerProps = {
  endUserId: string;
  initialMessages: Message[];
  sideInfo: ChatSideInfo;
  staffRole: StaffRole;
  staffId: string;
};

export function ChatContainer({
  endUserId,
  initialMessages,
  sideInfo,
  staffRole,
  staffId,
}: ChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [proxyMode, setProxyMode] = useState(false);
  const [proxyConfirmOpen, setProxyConfirmOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast, ToastContainer } = useToast();

  const canProxy = staffRole === "admin" || staffRole === "supervisor";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (body: string) => {
    if (proxyMode && canProxy) {
      setPendingMessage(body);
      setProxyConfirmOpen(true);
      return;
    }

    await doSend(body, false);
  };

  const doSend = async (body: string, isProxy: boolean) => {
    setSending(true);

    // 楽観的更新: 送信前にUIに表示
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      direction: "out",
      body,
      sentByStaffName: null,
      sentAsProxy: isProxy,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const result = isProxy
        ? await sendProxyMessage({ endUserId, body, reason: "代理返信" })
        : await sendMessage({ endUserId, body });

      if (result.ok) {
        // 成功: 楽観的メッセージを実際のIDで置き換え
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId ? { ...m, id: result.data.messageId } : m
          )
        );
        showToast("メッセージを送信しました", "success");
      } else {
        // 失敗: 楽観的メッセージを削除（ロールバック）
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        showToast(result.error.message, "error");
      }
    } catch {
      // エラー: 楽観的メッセージを削除（ロールバック）
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      showToast("送信に失敗しました", "error");
    } finally {
      setSending(false);
      setPendingMessage("");
    }
  };

  const handleProxyConfirm = () => {
    setProxyConfirmOpen(false);
    doSend(pendingMessage, true);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* メインチャットエリア */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/50 px-6 py-4">
          <div>
            <h2 className="font-bold text-stone-800 text-lg">{sideInfo.nickname}</h2>
            <p className="text-sm font-medium text-stone-500">
              {sideInfo.planCode.charAt(0).toUpperCase() + sideInfo.planCode.slice(1)} ・{" "}
              {sideInfo.assignedCastName ?? "担当未割当"}
            </p>
          </div>
          {canProxy && (
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-sm hover:bg-stone-50 transition-colors">
              <input
                type="checkbox"
                checked={proxyMode}
                onChange={(e) => setProxyMode(e.target.checked)}
                className="rounded border-stone-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-stone-600">代理返信モード</span>
            </label>
          )}
        </div>

        {/* メッセージ履歴 */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-50/30">
          <ChatHistory messages={messages} />
          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <MessageComposer
          onSend={handleSend}
          sending={sending}
          proxyMode={proxyMode}
          endUserId={endUserId}
        />
      </div>

      {/* サイドパネル（デスクトップのみ） */}
      <div className="hidden w-80 lg:block overflow-y-auto pr-1">
        <ChatSidePanel sideInfo={sideInfo} endUserId={endUserId} />
      </div>

      {/* 代理返信確認ダイアログ */}
      <ConfirmDialog
        open={proxyConfirmOpen}
        title="代理返信の確認"
        description="このメッセージを代理返信として送信しますか？監査ログに記録されます。"
        confirmLabel="代理返信"
        variant="default"
        onConfirm={handleProxyConfirm}
        onCancel={() => setProxyConfirmOpen(false)}
        loading={sending}
      />

      <ToastContainer />
    </div>
  );
}
