"use client";

import { useInlineEdit } from "@/hooks/useInlineEdit";
import type { Result } from "@/actions/types";

type InlineEditProps = {
  /** 現在の値 */
  value: string;
  /** 保存時のコールバック */
  onSave: (value: string) => Promise<Result<unknown>>;
  /** 保存成功時のコールバック */
  onSuccess?: () => void;
  /** 保存失敗時のコールバック */
  onError?: (message: string) => void;
  /** プレースホルダー */
  placeholder?: string;
  /** 追加のクラス名 */
  className?: string;
  /** 表示用のクラス名 */
  displayClassName?: string;
  /** 入力用のクラス名 */
  inputClassName?: string;
  /** 複数行入力かどうか */
  multiline?: boolean;
  /** 最大文字数 */
  maxLength?: number;
  /** 空の場合に表示するテキスト */
  emptyText?: string;
};

/**
 * インライン編集コンポーネント
 *
 * @example
 * ```tsx
 * <InlineEdit
 *   value={nickname}
 *   onSave={async (value) => await updateNickname(userId, value)}
 *   onSuccess={() => showToast("保存しました", "success")}
 *   placeholder="ニックネームを入力"
 * />
 * ```
 */
export function InlineEdit({
  value,
  onSave,
  onSuccess,
  onError,
  placeholder = "",
  className = "",
  displayClassName = "",
  inputClassName = "",
  multiline = false,
  maxLength,
  emptyText = "未設定",
}: InlineEditProps) {
  const {
    isEditing,
    saving,
    startEdit,
    inputProps,
  } = useInlineEdit(value, onSave, { onSuccess, onError });

  if (!isEditing) {
    return (
      <div
        onDoubleClick={startEdit}
        onClick={startEdit}
        className={`cursor-pointer rounded px-2 py-1 transition-colors hover:bg-gray-100 ${displayClassName} ${className}`}
        title="クリックして編集"
      >
        {value || <span className="text-gray-400">{emptyText}</span>}
      </div>
    );
  }

  const commonInputClasses = `w-full rounded border-2 border-blue-500 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
    saving ? "bg-gray-100" : "bg-white"
  } ${inputClassName} ${className}`;

  if (multiline) {
    return (
      <textarea
        autoFocus
        {...inputProps}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`${commonInputClasses} min-h-[80px] resize-y`}
        rows={3}
      />
    );
  }

  return (
    <input
      type="text"
      autoFocus
      {...inputProps}
      placeholder={placeholder}
      maxLength={maxLength}
      className={commonInputClasses}
    />
  );
}

/**
 * タグ用インライン編集コンポーネント
 */
type InlineTagEditProps = {
  /** タグの配列 */
  tags: string[];
  /** 保存時のコールバック */
  onSave: (tags: string[]) => Promise<Result<unknown>>;
  /** 保存成功時のコールバック */
  onSuccess?: () => void;
  /** 保存失敗時のコールバック */
  onError?: (message: string) => void;
  /** 追加のクラス名 */
  className?: string;
};

export function InlineTagEdit({
  tags,
  onSave,
  onSuccess,
  onError,
  className = "",
}: InlineTagEditProps) {
  const tagsString = tags.join(", ");

  const handleSave = async (value: string): Promise<Result<unknown>> => {
    const newTags = value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return onSave(newTags);
  };

  const {
    isEditing,
    saving,
    startEdit,
    inputProps,
  } = useInlineEdit(tagsString, handleSave, { onSuccess, onError });

  if (!isEditing) {
    return (
      <div
        onDoubleClick={startEdit}
        onClick={startEdit}
        className={`flex cursor-pointer flex-wrap gap-1 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 ${className}`}
        title="クリックして編集"
      >
        {tags.length > 0 ? (
          tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-400">タグなし</span>
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      {...inputProps}
      placeholder="タグをカンマ区切りで入力"
      className={`w-full rounded border-2 border-blue-500 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 ${
        saving ? "bg-gray-100" : "bg-white"
      } ${className}`}
    />
  );
}
