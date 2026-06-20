"use client";

import { truncateMessageBody } from "@/lib/push-notification-targets";
import { useMessageRealtime } from "@/hooks/useMessageRealtime";
import { getEndUserDisplayName } from "@/actions/chat";

export function RealtimeNotification() {
  useMessageRealtime(
    (message) => {
      if (message.direction !== "in") {
        return;
      }

      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        // 送信ユーザー名をタイトルに出す。取得できなければ汎用タイトルにフォールバック。
        void getEndUserDisplayName(message.end_user_id).then((result) => {
          const title = result.ok ? `${result.data.displayName}さん` : "新着メッセージ";
          new Notification(title, {
            body: truncateMessageBody(message.body),
            icon: "/icon-192.png",
            tag: `msg-${message.end_user_id}`,
          });
        });
      }
    },
    (message) => message.direction === "in"
  );

  return null;
}
