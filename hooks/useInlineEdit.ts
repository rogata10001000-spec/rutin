"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Result } from "@/actions/types";

type UseInlineEditOptions = {
  /** ブラー時に自動保存するか。デフォルト: true */
  saveOnBlur?: boolean;
  /** 保存成功時のコールバック */
  onSuccess?: () => void;
  /** 保存失敗時のコールバック */
  onError?: (message: string) => void;
};

type UseInlineEditReturn<T> = {
  /** 編集モードかどうか */
  isEditing: boolean;
  /** 現在の編集値 */
  value: T;
  /** 編集値を更新 */
  setValue: (value: T) => void;
  /** 保存中かどうか */
  saving: boolean;
  /** 編集を開始 */
  startEdit: () => void;
  /** 編集をキャンセル */
  cancel: () => void;
  /** 保存を実行 */
  save: () => Promise<boolean>;
  /** キーボードイベントハンドラ（Enter: 保存, Escape: キャンセル） */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** input/textareaに設定するprops */
  inputProps: {
    value: T;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onBlur: () => void;
    disabled: boolean;
  };
};

/**
 * インライン編集機能を提供するカスタムフック
 *
 * @example
 * ```tsx
 * const { isEditing, startEdit, inputProps } = useInlineEdit(
 *   nickname,
 *   async (value) => await updateNickname(value),
 *   { onSuccess: () => showToast("保存しました", "success") }
 * );
 *
 * return isEditing ? (
 *   <input autoFocus {...inputProps} />
 * ) : (
 *   <span onDoubleClick={startEdit}>{nickname}</span>
 * );
 * ```
 */
export function useInlineEdit<T extends string>(
  initialValue: T,
  onSave: (value: T) => Promise<Result<unknown>>,
  options: UseInlineEditOptions = {}
): UseInlineEditReturn<T> {
  const { saveOnBlur = true, onSuccess, onError } = options;

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<T>(initialValue);
  const [saving, setSaving] = useState(false);

  const initialValueRef = useRef(initialValue);

  // initialValueが変更された場合に更新
  useEffect(() => {
    initialValueRef.current = initialValue;
    if (!isEditing) {
      setValue(initialValue);
    }
  }, [initialValue, isEditing]);

  const startEdit = useCallback(() => {
    setValue(initialValueRef.current);
    setIsEditing(true);
  }, []);

  const cancel = useCallback(() => {
    setValue(initialValueRef.current);
    setIsEditing(false);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    // 値が変更されていない場合はスキップ
    if (value === initialValueRef.current) {
      setIsEditing(false);
      return true;
    }

    setSaving(true);

    try {
      const result = await onSave(value);

      if (result.ok) {
        initialValueRef.current = value;
        setIsEditing(false);
        onSuccess?.();
        return true;
      } else {
        onError?.(result.error.message);
        return false;
      }
    } catch {
      onError?.("保存に失敗しました");
      return false;
    } finally {
      setSaving(false);
    }
  }, [value, onSave, onSuccess, onError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel]
  );

  const handleBlur = useCallback(() => {
    if (saveOnBlur && !saving) {
      save();
    }
  }, [saveOnBlur, saving, save]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(e.target.value as T);
    },
    []
  );

  const inputProps = {
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
    disabled: saving,
  };

  return {
    isEditing,
    value,
    setValue,
    saving,
    startEdit,
    cancel,
    save,
    handleKeyDown,
    inputProps,
  };
}
