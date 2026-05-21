"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMessageRealtime } from "@/hooks/useMessageRealtime";

type InboxAutoRefreshProps = {
  intervalMs?: number;
};

export function InboxAutoRefresh({ intervalMs = 30000 }: InboxAutoRefreshProps) {
  const router = useRouter();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useMessageRealtime(
    () => {
      refresh();
    },
    (message) => message.direction === "in"
  );

  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  // 不可視→可視に復帰したとき即座にリフレッシュ
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  return null;
}
