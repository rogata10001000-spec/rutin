"use client";

import { truncateMessageBody } from "@/lib/push-notification-targets";
import { useMessageRealtime } from "@/hooks/useMessageRealtime";

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
        new Notification("新着メッセージ", {
          body: truncateMessageBody(message.body),
          icon: "/icon-192.png",
          tag: `msg-${message.end_user_id}`,
        });
      }
    },
    (message) => message.direction === "in"
  );

  return null;
}
