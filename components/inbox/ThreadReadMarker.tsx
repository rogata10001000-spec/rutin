"use client";

import { useEffect, useRef } from "react";
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
  const lastMarkedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount <= 0) return;

    const key = `${endUserId}:${lastMessageAt ?? "none"}:${unreadCount}`;
    if (lastMarkedKeyRef.current === key) return;

    let active = true;
    (async () => {
      // markThreadRead 側の revalidatePath("/inbox") で一覧の未読バッジは更新される。
      // ここで router.refresh() も呼ぶと、会話を開いた直後（一番待たせたくない瞬間）に
      // 重い /inbox を二重に再取得することになるため呼ばない。
      const result = await markThreadRead({ endUserId });
      if (!active || !result.ok) return;
      lastMarkedKeyRef.current = key;
    })();

    return () => {
      active = false;
    };
  }, [endUserId, unreadCount, lastMessageAt]);

  return null;
}
