"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMessageRealtime } from "@/hooks/useMessageRealtime";

type InboxAutoRefreshProps = {
  intervalMs?: number;
};

/**
 * 受信一覧の再取得の最短間隔。
 * /inbox はアプリで最も重いルート（全ユーザー＋スレッド集計）なので、
 * 受信が連続したときに毎回フル再取得すると一覧が読んでいる最中にガタつく。
 * バーストは末尾で1回にまとめる。
 */
const MIN_REFRESH_INTERVAL_MS = 3000;

export function InboxAutoRefresh({ intervalMs = 30000 }: InboxAutoRefreshProps) {
  const router = useRouter();
  const requestRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let lastRefreshAt = 0;
    let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
    let missedWhileHidden = false;
    let disposed = false;

    const requestRefresh = () => {
      if (disposed) return;

      // 非表示タブでは重い再取得をしない。復帰時にまとめて1回だけ流す。
      if (document.visibilityState === "hidden") {
        missedWhileHidden = true;
        return;
      }

      const elapsed = Date.now() - lastRefreshAt;
      if (elapsed >= MIN_REFRESH_INTERVAL_MS) {
        if (coalesceTimer) {
          clearTimeout(coalesceTimer);
          coalesceTimer = null;
        }
        lastRefreshAt = Date.now();
        missedWhileHidden = false;
        router.refresh();
        return;
      }

      // 直近に実行済みなら、間隔が空くまで待って1回だけ実行する（連続受信での多重再取得を防ぐ）。
      if (coalesceTimer) return;
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null;
        requestRefresh();
      }, MIN_REFRESH_INTERVAL_MS - elapsed);
    };

    requestRefreshRef.current = requestRefresh;

    const poll = setInterval(requestRefresh, intervalMs);

    // 復帰時は、隠れている間に更新があったか、前回取得から時間が経っているときだけ取り直す。
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (missedWhileHidden || Date.now() - lastRefreshAt >= intervalMs) {
        requestRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      clearInterval(poll);
      if (coalesceTimer) clearTimeout(coalesceTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, intervalMs]);

  // 受信だけでなく自分の送信も拾う。送信アクション側で revalidatePath("/inbox") を
  // 外した（＝返信の応答が一覧の再レンダリングを待たない）ぶんを、ここでまとめて反映する。
  const handleRealtimeMessage = useCallback(() => {
    requestRefreshRef.current();
  }, []);
  useMessageRealtime(handleRealtimeMessage);

  return null;
}
