"use client";

import { useEffect, useRef, useState } from "react";
import { getClientEnv } from "@/lib/env";

type Phase = "loading" | "done" | "error" | "not_configured";

type LiffModule = {
  init: (config: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (config?: { redirectUri?: string }) => void;
  getIDToken: () => string | null;
  closeWindow: () => void;
};

/**
 * 公式LINEの流入元(src)を捕捉する LIFF 入口。
 *
 * 各サイト/広告の「LINEで始める」を `https://liff.line.me/{liffId}?src=xxx` に向ける。
 * ここで src と LINEのIDトークン(lineUserId) を取得して記録し、友だち追加後の
 * follow 時に end_users.acquisition_source へ確定する。
 * （LIFF/Loginチャネルの「友だち追加オプション」を Aggressive にすると追加も促せる）
 */
export function LiffStartClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string>("");
  const liffRef = useRef<LiffModule | null>(null);

  useEffect(() => {
    const liffId = getClientEnv().NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setPhase("not_configured");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const liff = (await import("@line/liff")).default as unknown as LiffModule;
        liffRef.current = liff;
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          // src を保持したまま LINE ログインへ（戻り先は現在URL）。
          liff.login({ redirectUri: window.location.href });
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

        const params = new URLSearchParams(window.location.search);
        const src = params.get("src") ?? params.get("utm_source");

        await fetch("/api/liff/attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            src,
            landingUrl: window.location.href,
            referrer: document.referrer || null,
          }),
        });

        if (!cancelled) {
          setPhase("done");
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
      {phase === "loading" && (
        <>
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-primary"
            aria-hidden
          />
          <p className="text-sm text-stone-500">読み込んでいます…</p>
        </>
      )}

      {phase === "done" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-bold text-stone-800">ようこそ Rutin へ</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            友だち追加ありがとうございます。LINEのトークに送られた案内から、
            メイトを選んで始めてください。
          </p>
          <button
            type="button"
            onClick={() => liffRef.current?.closeWindow()}
            className="mt-4 rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] transition-colors"
          >
            トークへ戻る
          </button>
        </div>
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
