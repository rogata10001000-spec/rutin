"use client";

import { useEffect, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info";

type ToastProps = {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
  /** Undoコールバック。設定するとUndoボタンが表示される */
  onUndo?: () => void;
  /** Undoボタンのラベル。デフォルト: "元に戻す" */
  undoLabel?: string;
};

const typeConfig = {
  success: {
    className: "bg-green-50 border-green-200 text-green-800",
    icon: (
      <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    className: "bg-red-50 border-red-200 text-red-800",
    icon: (
      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    className: "bg-blue-50 border-blue-200 text-blue-800",
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export function Toast({
  message,
  type,
  onClose,
  duration = 5000,
  onUndo,
  undoLabel = "元に戻す",
}: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(Math.ceil(duration / 1000));
  const config = typeConfig[type];

  // カウントダウンタイマー（Undoがある場合のみ）
  useEffect(() => {
    if (!onUndo) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [onUndo]);

  // 自動クローズ
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleUndo = useCallback(() => {
    onUndo?.();
    handleClose();
  }, [onUndo, handleClose]);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 shadow-lg transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${config.className}`}
    >
      {config.icon}
      <p className="text-sm font-medium">{message}</p>

      {/* Undoボタン（タイマー付き） */}
      {onUndo && timeLeft > 0 && (
        <button
          onClick={handleUndo}
          className="ml-2 rounded-md bg-black/10 px-3 py-1 text-sm font-medium hover:bg-black/20"
        >
          {undoLabel} ({timeLeft}s)
        </button>
      )}

      <button
        onClick={handleClose}
        className="ml-2 rounded-md p-1 hover:bg-black/5"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

type ToastOptions = {
  /** Undoコールバック */
  onUndo?: () => void;
  /** Undoボタンのラベル */
  undoLabel?: string;
  /** 表示時間（ミリ秒） */
  duration?: number;
};

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  onUndo?: () => void;
  undoLabel?: string;
  duration?: number;
};

/**
 * Toast表示用のフック
 *
 * @example
 * ```tsx
 * const { showToast, ToastContainer } = useToast();
 *
 * // 通常のトースト
 * showToast("保存しました", "success");
 *
 * // Undo付きトースト
 * showToast("削除しました", "success", {
 *   onUndo: () => restoreItem(),
 *   duration: 5000,
 * });
 * ```
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options?: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type,
          onUndo: options?.onUndo,
          undoLabel: options?.undoLabel,
          duration: options?.duration,
        },
      ]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ToastContainer = useCallback(
    () => (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            onUndo={toast.onUndo}
            undoLabel={toast.undoLabel}
            duration={toast.duration}
          />
        ))}
      </div>
    ),
    [toasts, removeToast]
  );

  return { showToast, removeToast, ToastContainer };
}
