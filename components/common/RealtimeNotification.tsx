"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type RealtimeNotificationProps = {
  staffId: string;
};

export function RealtimeNotification({ staffId }: RealtimeNotificationProps) {
  const permissionRef = useRef<NotificationPermission>("default");

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      permissionRef.current = "granted";
      return;
    }
    if (Notification.permission !== "denied") {
      const result = await Notification.requestPermission();
      permissionRef.current = result;
    }
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

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

          if (permissionRef.current === "granted" && document.visibilityState === "hidden") {
            new Notification("新着メッセージ", {
              body: msg.body.length > 80 ? msg.body.slice(0, 80) + "..." : msg.body,
              icon: "/icon-192.png",
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
