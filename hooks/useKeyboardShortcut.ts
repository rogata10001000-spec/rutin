"use client";

import { useEffect, useCallback, useRef, useState } from "react";

type ModifierKeys = {
  /** Ctrlキーが必要か */
  ctrl?: boolean;
  /** Meta（Cmd）キーが必要か。trueの場合、CtrlもMetaとして扱う */
  meta?: boolean;
  /** Shiftキーが必要か */
  shift?: boolean;
  /** Altキーが必要か */
  alt?: boolean;
};

type UseKeyboardShortcutOptions = ModifierKeys & {
  /** デフォルトの動作を抑制するか。デフォルト: true */
  preventDefault?: boolean;
  /** 有効かどうか。デフォルト: true */
  enabled?: boolean;
  /** input/textarea内でも発火するか。デフォルト: false */
  enableInInput?: boolean;
};

/**
 * キーボードショートカットを設定するカスタムフック
 *
 * @example
 * ```tsx
 * // Cmd/Ctrl + S で保存
 * useKeyboardShortcut("s", handleSave, { meta: true });
 *
 * // Escapeでモーダルを閉じる
 * useKeyboardShortcut("Escape", closeModal);
 *
 * // Shift + ? でヘルプ表示
 * useKeyboardShortcut("?", showHelp, { shift: true });
 * ```
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: UseKeyboardShortcutOptions = {}
): void {
  const {
    ctrl = false,
    meta = false,
    shift = false,
    alt = false,
    preventDefault = true,
    enabled = true,
    enableInInput = false,
  } = options;

  const callbackRef = useRef(callback);

  // 最新のコールバックを参照に保持
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // input/textarea内での発火を制御
      if (!enableInInput) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          // Escapeは常に許可
          if (key.toLowerCase() !== "escape") {
            return;
          }
        }
      }

      // 修飾キーのチェック
      const isCtrlOrMeta = meta
        ? e.metaKey || e.ctrlKey // Macの場合Cmd、Windows/Linuxの場合Ctrl
        : ctrl
        ? e.ctrlKey
        : !e.ctrlKey && !e.metaKey;

      const isShift = shift ? e.shiftKey : !e.shiftKey;
      const isAlt = alt ? e.altKey : !e.altKey;

      // キーのマッチング（大文字小文字を無視）
      const keyMatches =
        e.key.toLowerCase() === key.toLowerCase() ||
        e.code.toLowerCase() === `key${key.toLowerCase()}`;

      if (keyMatches && isCtrlOrMeta && isShift && isAlt) {
        if (preventDefault) {
          e.preventDefault();
        }
        callbackRef.current();
      }
    },
    [key, ctrl, meta, shift, alt, preventDefault, enabled, enableInInput]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * 複数のキーボードショートカットを一括で設定するフック
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: "s", callback: handleSave, meta: true },
 *   { key: "k", callback: openCommandPalette, meta: true },
 *   { key: "Escape", callback: closeModal },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: Array<{
    key: string;
    callback: () => void;
  } & UseKeyboardShortcutOptions>
): void {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const {
          key,
          callback,
          ctrl = false,
          meta = false,
          shift = false,
          alt = false,
          preventDefault = true,
          enabled = true,
          enableInInput = false,
        } = shortcut;

        if (!enabled) continue;

        // input/textarea内での発火を制御
        if (!enableInInput) {
          const target = e.target as HTMLElement;
          if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          ) {
            if (key.toLowerCase() !== "escape") {
              continue;
            }
          }
        }

        // 修飾キーのチェック
        const isCtrlOrMeta = meta
          ? e.metaKey || e.ctrlKey
          : ctrl
          ? e.ctrlKey
          : !e.ctrlKey && !e.metaKey;

        const isShift = shift ? e.shiftKey : !e.shiftKey;
        const isAlt = alt ? e.altKey : !e.altKey;

        const keyMatches =
          e.key.toLowerCase() === key.toLowerCase() ||
          e.code.toLowerCase() === `key${key.toLowerCase()}`;

        if (keyMatches && isCtrlOrMeta && isShift && isAlt) {
          if (preventDefault) {
            e.preventDefault();
          }
          callback();
          break; // 最初にマッチしたショートカットのみ実行
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * リスト操作用のキーボードナビゲーションフック
 *
 * @example
 * ```tsx
 * const { selectedIndex, setSelectedIndex } = useListNavigation({
 *   itemCount: items.length,
 *   onSelect: (index) => router.push(`/items/${items[index].id}`),
 * });
 * ```
 */
export function useListNavigation(options: {
  itemCount: number;
  onSelect?: (index: number) => void;
  enabled?: boolean;
}): {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
} {
  const { itemCount, onSelect, enabled = true } = options;
  const selectedIndexRef = useRef(0);

  // 状態を外部に公開するためにuseStateを使用
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!enabled || itemCount === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // input/textarea内では無効
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, itemCount - 1);
            selectedIndexRef.current = next;
            return next;
          });
          break;

        case "k":
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            selectedIndexRef.current = next;
            return next;
          });
          break;

        case "Enter":
          e.preventDefault();
          onSelect?.(selectedIndexRef.current);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itemCount, onSelect, enabled]);

  // itemCountが変更された場合にインデックスを調整
  useEffect(() => {
    if (selectedIndex >= itemCount) {
      setSelectedIndex(Math.max(0, itemCount - 1));
    }
  }, [itemCount, selectedIndex]);

  return { selectedIndex, setSelectedIndex };
}
