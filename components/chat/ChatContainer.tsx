"use client";

import { useState, useRef, useEffect } from "react";
import type { Message, ChatSideInfo } from "@/actions/chat";
import type { StaffRole } from "@/lib/supabase/types";
import { sendMessage, sendProxyMessage } from "@/actions/messages";
import { ChatHistory } from "./ChatHistory";
import { MessageComposer } from "./MessageComposer";
import { TodayProgressBar } from "./TodayProgressBar";
import { NextUserButton } from "./NextUserButton";
import { useToast } from "@/components/common/Toast";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useMessageRealtime } from "@/hooks/useMessageRealtime";

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

  useMessageRealtime(
    (message) => {
      if (message.direction === "out" && message.sent_by_staff_id === staffId) {
        return;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: message.id,
            direction: message.direction,
            body: message.body,
            sentByStaffName: null,
            sentAsProxy: message.sent_as_proxy,
            createdAt: message.created_at,
          },
        ];
      });
    },
    (message) => message.end_user_id === endUserId
  );

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
        // 成功: 楽観的メッセージを実際のIDで置き換え（Realtime分と重複しないようdedupe）
        setMessages((prev) => {
          const messageId = result.data.messageId;
          if (prev.some((m) => m.id === messageId)) {
            return prev.filter((m) => m.id !== optimisticId);
          }

          return prev.map((m) =>
            m.id === optimisticId ? { ...m, id: messageId } : m
          );
        });
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
    <div className="flex h-full flex-col">
      {/* メインチャットエリア */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-100 bg-stone-50/50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-800 sm:text-lg">
              {sideInfo.nickname}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm font-medium text-stone-500">
                {sideInfo.planCode.charAt(0).toUpperCase() + sideInfo.planCode.slice(1)} ・{" "}
                {sideInfo.assignedCastName ?? "担当未割当"}
              </p>
              {sideInfo.lineAccountName && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {sideInfo.lineAccountName}
                </span>
              )}
              <TodayProgressBar />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NextUserButton currentUserId={endUserId} />
            {canProxy && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={proxyMode}
                  onChange={(e) => setProxyMode(e.target.checked)}
                  className="rounded border-stone-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="whitespace-nowrap text-stone-600">代理返信</span>
              </label>
            )}
          </div>
        </div>

        {/* メッセージ履歴 */}
        <div className="flex-1 overflow-y-auto bg-stone-50/30 p-4 sm:p-6">
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
