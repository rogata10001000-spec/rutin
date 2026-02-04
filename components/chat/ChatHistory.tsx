"use client";

import type { Message } from "@/actions/chat";
import { format } from "date-fns";

type ChatHistoryProps = {
  messages: Message[];
};

export function ChatHistory({ messages }: ChatHistoryProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${
            message.direction === "out" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[70%] rounded-lg px-4 py-2 ${
              message.direction === "out"
                ? message.sentAsProxy
                  ? "bg-purple-100 text-purple-900"
                  : "bg-blue-100 text-blue-900"
                : "bg-gray-100 text-gray-900"
            }`}
          >
            {/* ギフトメッセージの特別表示 */}
            {message.body.startsWith("🎁") ? (
              <div className="text-center">
                <p className="text-lg">{message.body}</p>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            )}
            <div
              className={`mt-1 flex items-center gap-2 text-xs ${
                message.direction === "out"
                  ? "justify-end text-blue-600"
                  : "text-gray-500"
              }`}
            >
              {message.sentAsProxy && (
                <span className="rounded bg-purple-200 px-1 text-purple-700">
                  代理
                </span>
              )}
              {message.sentByStaffName && (
                <span>{message.sentByStaffName}</span>
              )}
              <span>{format(new Date(message.createdAt), "HH:mm")}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
