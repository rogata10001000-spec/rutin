"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Result } from "@/actions/types";

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

type UseAutoSaveOptions = {
  /** 入力停止から保存までの遅延（ミリ秒）。デフォルト: 1500 */
  delay?: number;
  /** 自動保存を有効にするか。デフォルト: true */
  enabled?: boolean;
  /** 保存成功後に「保存しました」表示を維持する時間（ミリ秒）。デフォルト: 2000 */
  savedDisplayDuration?: number;
};

type UseAutoSaveReturn<T> = {
  /** 現在の保存状態 */
  status: AutoSaveStatus;
  /** 未保存の変更があるか */
  hasUnsaved: boolean;
  /** データが変更されたことをマーク */
  markAsChanged: () => void;
  /** 即座に保存を実行 */
  saveNow: () => Promise<boolean>;
  /** 変更をリセット（保存後などに使用） */
  resetChanges: () => void;
};

/**
 * 自動保存機能を提供するカスタムフック
 *
 * @example
 * ```tsx
 * const { status, hasUnsaved, markAsChanged } = useAutoSave(
 *   formData,
 *   async (data) => await saveToServer(data),
 *   { delay: 1500 }
 * );
 *
 * const handleChange = (e) => {
 *   setFormData(e.target.value);
 *   markAsChanged();
 * };
 * ```
 */
export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<Result<unknown>>,
  options: UseAutoSaveOptions = {}
): UseAutoSaveReturn<T> {
  const { delay = 1500, enabled = true, savedDisplayDuration = 2000 } = options;

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef(data);

  // 最新のdataを参照に保持
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // 自動保存のトリガー
  useEffect(() => {
    if (!enabled || !hasUnsaved) return;

    // 前のタイマーをクリア
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // デバウンスタイマーを設定
    timeoutRef.current = setTimeout(async () => {
      setStatus("saving");

      try {
        const result = await onSave(dataRef.current);

        if (result.ok) {
          setStatus("saved");
          setHasUnsaved(false);

          // 「保存しました」表示を一定時間後に消す
          if (savedTimeoutRef.current) {
            clearTimeout(savedTimeoutRef.current);
          }
          savedTimeoutRef.current = setTimeout(() => {
            setStatus("idle");
          }, savedDisplayDuration);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, enabled, hasUnsaved, delay, savedDisplayDuration, onSave]);

  // 離脱時の警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsaved]);

  const markAsChanged = useCallback(() => {
    setHasUnsaved(true);
    if (status === "saved" || status === "error") {
      setStatus("idle");
    }
  }, [status]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setStatus("saving");

    try {
      const result = await onSave(dataRef.current);

      if (result.ok) {
        setStatus("saved");
        setHasUnsaved(false);

        if (savedTimeoutRef.current) {
          clearTimeout(savedTimeoutRef.current);
        }
        savedTimeoutRef.current = setTimeout(() => {
          setStatus("idle");
        }, savedDisplayDuration);

        return true;
      } else {
        setStatus("error");
        return false;
      }
    } catch {
      setStatus("error");
      return false;
    }
  }, [onSave, savedDisplayDuration]);

  const resetChanges = useCallback(() => {
    setHasUnsaved(false);
    setStatus("idle");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return {
    status,
    hasUnsaved,
    markAsChanged,
    saveNow,
    resetChanges,
  };
}
