"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markThreadRead } from "@/actions/thread-reads";

type ThreadReadMarkerProps = {
  endUserId: string;
  unreadCount: number;
  lastMessageAt: string | null;
};

/**
 * 会話を開いたタイミングで、当該スタッフの既読位置を更新する。
 */
export function ThreadReadMarker({
  endUserId,
  unreadCount,
  lastMessageAt,
}: ThreadReadMarkerProps) {
  const router = useRouter();
  const lastMarkedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount <= 0) return;

    const key = `${endUserId}:${lastMessageAt ?? "none"}:${unreadCount}`;
    if (lastMarkedKeyRef.current === key) return;

    let active = true;
    (async () => {
      const result = await markThreadRead({ endUserId });
      if (!active || !result.ok) return;
      lastMarkedKeyRef.current = key;
      router.refresh();
    })();

    return () => {
      active = false;
    };
  }, [endUserId, unreadCount, lastMessageAt, router]);

  return null;
}
