"use client";

import { useEffect, useState } from "react";
import { getClientEnv } from "@/lib/env";

type Phase = "loading" | "redirecting" | "error" | "not_configured";

export function LiffMyPageClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const liffId = getClientEnv().NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setPhase("not_configured");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          // LINEログインへ。戻り先は現在のLIFF URL。
          liff.login();
          return;
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          if (!cancelled) {
            setPhase("error");
            setMessage("ログイン情報を取得できませんでした。もう一度お試しください。");
          }
          return;
        }

        const res = await fetch("/api/liff/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (!res.ok) {
          if (!cancelled) {
            setPhase("error");
            setMessage("認証に失敗しました。時間をおいて再度お試しください。");
          }
          return;
        }

        if (!cancelled) {
          setPhase("redirecting");
          window.location.replace("/account/plan");
        }
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setMessage(
            err instanceof Error && /init/i.test(err.message)
              ? "このページはLINEアプリから開いてください。"
              : "読み込みに失敗しました。LINEアプリから開き直してください。"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {(phase === "loading" || phase === "redirecting") && (
        <>
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-primary"
            aria-hidden
          />
          <p className="text-sm text-stone-500">
            {phase === "redirecting" ? "契約ページへ移動しています…" : "読み込んでいます…"}
          </p>
        </>
      )}

      {phase === "not_configured" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-bold text-stone-800">準備中です</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            このページは現在準備中です。お手数ですが、トーク画面のメニューからご利用ください。
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-base font-bold text-amber-900">開けませんでした</h1>
          <p className="mt-2 text-sm leading-relaxed text-amber-800">{message}</p>
        </div>
      )}
    </div>
  );
}
