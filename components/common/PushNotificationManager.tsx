"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPushNotificationConfig,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/actions/push-notifications";

type PushStatus = "loading" | "unsupported" | "not-configured" | "disabled" | "enabled" | "denied";

const DISMISS_KEY = "rutin_push_prompt_dismissed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function isPushSupported() {
  return "serviceWorker" in navigator && "Notification" in window;
}

function canSubscribeToPush() {
  return isPushSupported() && "PushManager" in window;
}

function getDeviceContext() {
  if (typeof window === "undefined") {
    return {
      isIOS: false,
      isMacSafari: false,
      isStandalone: false,
      requiresHomeScreenInstall: false,
    };
  }

  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isMacSafari =
    /Macintosh/.test(userAgent) &&
    /Safari/.test(userAgent) &&
    !/Chrome|CriOS|Edg|OPR|Firefox/.test(userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    isIOS,
    isMacSafari,
    isStandalone,
    requiresHomeScreenInstall: isIOS && !isStandalone,
  };
}

export function PushNotificationManager() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const deviceContext = useMemo(() => getDeviceContext(), []);

  // 一度閉じたら次回以降は表示しない（邪魔にならないように）。
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // localStorage 不可でも閉じる動作は継続
    }
  };

  const deviceHint = useMemo(() => {
    if (deviceContext.requiresHomeScreenInstall) {
      return "iPhone/iPadでは共有ボタンから「ホーム画面に追加」した後、このアプリから通知を有効にしてください。";
    }

    if (deviceContext.isMacSafari) {
      return "Safariでは「Safari → 設定 → Webサイト → 通知」で rutin の通知を許可してください。";
    }

    return null;
  }, [deviceContext.isMacSafari, deviceContext.requiresHomeScreenInstall]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }

      if (deviceContext.requiresHomeScreenInstall) {
        setStatus("disabled");
        return;
      }

      if (!canSubscribeToPush()) {
        setStatus("unsupported");
        return;
      }

      const config = await getPushNotificationConfig();
      if (cancelled) return;

      if (!config.ok || !config.data.enabled || !config.data.publicKey) {
        setStatus("not-configured");
        setMessage(config.ok ? "Web PushのVAPID鍵が未設定です。" : config.error.message);
        return;
      }

      setPublicKey(config.data.publicKey);

      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setStatus(subscription ? "enabled" : "disabled");
    }

    initialize().catch((error) => {
      if (!cancelled) {
        setStatus("disabled");
        setMessage(error instanceof Error ? error.message : "通知状態の確認に失敗しました。");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deviceContext.requiresHomeScreenInstall]);

  const handleEnable = async () => {
    if (!publicKey || !canSubscribeToPush() || deviceContext.requiresHomeScreenInstall) return;

    setIsWorking(true);
    setMessage(null);

    try {
      await navigator.serviceWorker.register("/sw.js");
      const readyRegistration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();

      if (permission === "denied") {
        setStatus("denied");
        setMessage("ブラウザ設定で通知がブロックされています。");
        return;
      }

      if (permission !== "granted") {
        setStatus("disabled");
        setMessage("通知許可が完了しませんでした。");
        return;
      }

      const subscription =
        (await readyRegistration.pushManager.getSubscription()) ??
        (await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("通知購読情報を取得できませんでした。");
      }

      const result = await registerPushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: window.navigator.userAgent,
        platform: window.navigator.platform,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      setStatus("enabled");
      setMessage("この端末の通知を有効にしました。");
    } catch (error) {
      setStatus("disabled");
      setMessage(error instanceof Error ? error.message : "通知の有効化に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDisable = async () => {
    if (!canSubscribeToPush()) return;

    setIsWorking(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const result = await unregisterPushSubscription({ endpoint: subscription.endpoint });
        if (!result.ok) {
          throw new Error(result.error.message);
        }
        await subscription.unsubscribe();
      }

      setStatus("disabled");
      setMessage("この端末の通知を解除しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "通知解除に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  };

  const enableDisabled =
    isWorking ||
    status === "denied" ||
    status === "not-configured" ||
    deviceContext.requiresHomeScreenInstall;

  // ユーザーが閉じた場合や、表示する意味がない状態では出さない。
  if (
    dismissed ||
    status === "loading" ||
    (status === "unsupported" && !deviceContext.requiresHomeScreenInstall)
  ) {
    return null;
  }

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-30 w-[calc(100vw-1.5rem)] max-w-xs rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:bottom-4 sm:right-4 sm:w-auto sm:max-w-sm">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-terracotta" aria-hidden="true">
          notifications
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-800">Web通知（Safari / Chrome 対応）</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            状態:{" "}
            {status === "enabled"
              ? "有効"
              : status === "denied"
                ? "ブロック中"
                : status === "not-configured"
                  ? "未設定"
                  : "未有効"}
          </p>
          {deviceHint && <p className="mt-1 text-xs leading-5 text-amber-700">{deviceHint}</p>}
          {message && <p className="mt-1 text-xs leading-5 text-stone-500">{message}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {status === "enabled" ? (
              <button
                type="button"
                onClick={handleDisable}
                disabled={isWorking}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? "解除中..." : "この端末の通知を解除"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnable}
                disabled={enableDisabled}
                className="rounded-lg bg-terracotta px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? "有効化中..." : "通知を有効にする"}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="閉じる"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
