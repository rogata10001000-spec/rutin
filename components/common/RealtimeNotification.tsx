"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type RealtimeNotificationProps = {
  staffId: string;
};

export function RealtimeNotification({ staffId }: RealtimeNotificationProps) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("new-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "direction=eq.in",
        },
        (payload) => {
          const msg = payload.new as {
            end_user_id: string;
            body: string;
            direction: string;
          };

          if (msg.direction !== "in") return;

          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.visibilityState === "hidden"
          ) {
            new Notification("新着メッセージ", {
              body: msg.body.length > 80 ? msg.body.slice(0, 80) + "..." : msg.body,
              icon: "/icon.svg",
              tag: `msg-${msg.end_user_id}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId]);

  return null;
}
