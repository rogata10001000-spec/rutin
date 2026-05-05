"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPushNotificationConfig,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/actions/push-notifications";

type PushStatus = "loading" | "unsupported" | "not-configured" | "disabled" | "enabled" | "denied";

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
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function PushNotificationManager() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const deviceHint = useMemo(() => {
    if (typeof window === "undefined") return null;
    const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

    if (isIOS && !isStandalone) {
      return "iPhoneではホーム画面に追加した後に通知を許可してください。";
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!isPushSupported()) {
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
  }, []);

  const handleEnable = async () => {
    if (!publicKey || !isPushSupported()) return;

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
    if (!isPushSupported()) return;

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

  if (status === "loading" || status === "unsupported") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 max-w-sm rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-terracotta" aria-hidden="true">
          notifications
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-800">スマホ通知</p>
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
                disabled={isWorking || status === "denied" || status === "not-configured"}
                className="rounded-lg bg-terracotta px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isWorking ? "有効化中..." : "通知を有効にする"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
