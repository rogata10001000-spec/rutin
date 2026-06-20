"use client";

import { Fragment } from "react";
import type { Message } from "@/actions/chat";
import { format, isToday, isYesterday } from "date-fns";

type ChatHistoryProps = {
  messages: Message[];
};

function dayLabel(date: Date): string {
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  return format(date, "yyyy/MM/dd");
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-10 text-center text-sm text-stone-400">
        まだメッセージはありません
      </div>
    );
  }

  let lastDay = "";

  return (
    <div className="space-y-2.5">
      {messages.map((message) => {
        const created = new Date(message.createdAt);
        const day = format(created, "yyyy-MM-dd");
        const showDivider = day !== lastDay;
        lastDay = day;

        const isOut = message.direction === "out";
        const isGift = message.body.startsWith("🎁");

        return (
          <Fragment key={message.id}>
            {showDivider && (
              <div className="flex items-center justify-center py-2">
                <span className="rounded-full bg-stone-200/70 px-3 py-0.5 text-xs font-medium text-stone-500">
                  {dayLabel(created)}
                </span>
              </div>
            )}

            {isGift ? (
              <div className="flex justify-center py-1">
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-terracotta/10 px-5 py-2.5 text-center shadow-sm ring-1 ring-amber-200/60">
                  <p className="text-lg">{message.body}</p>
                </div>
              </div>
            ) : (
              <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isOut
                      ? message.sentAsProxy
                        ? "rounded-br-md bg-purple-500 text-white"
                        : "rounded-br-md bg-terracotta text-white"
                      : "rounded-bl-md border border-stone-200 bg-white text-stone-800"
                  }`}
                >
                  {message.messageType === "image" && message.mediaUrl ? (
                    <a
                      href={message.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={message.mediaUrl}
                        alt="受信した画像"
                        loading="lazy"
                        className="max-h-72 w-auto max-w-full rounded-lg object-contain"
                      />
                    </a>
                  ) : message.messageType === "image" ? (
                    <p className="italic opacity-80">画像を読み込めませんでした</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                  )}
                  <div
                    className={`mt-1 flex items-center gap-2 text-[11px] ${
                      isOut ? "justify-end text-white/75" : "text-stone-400"
                    }`}
                  >
                    {message.sentAsProxy && (
                      <span className="rounded bg-white/25 px-1.5 py-px font-medium text-white">
                        代理
                      </span>
                    )}
                    {message.sentByStaffName && <span>{message.sentByStaffName}</span>}
                    <span>{format(created, "HH:mm")}</span>
                  </div>
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
