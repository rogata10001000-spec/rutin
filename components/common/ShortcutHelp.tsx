"use client";

import { useState } from "react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

type Shortcut = {
  keys: string[];
  description: string;
  category: "navigation" | "editing" | "general";
};

const shortcuts: Shortcut[] = [
  // ナビゲーション
  { keys: ["⌘", "K"], description: "コマンドパレットを開く", category: "navigation" },
  { keys: ["j", "↓"], description: "リストを下に移動", category: "navigation" },
  { keys: ["k", "↑"], description: "リストを上に移動", category: "navigation" },
  { keys: ["Enter"], description: "選択/実行", category: "navigation" },

  // 編集
  { keys: ["⌘", "S"], description: "保存", category: "editing" },
  { keys: ["Esc"], description: "キャンセル/閉じる", category: "editing" },

  // 全般
  { keys: ["?"], description: "ショートカット一覧（このヘルプ）", category: "general" },
];

const categoryLabels = {
  navigation: "ナビゲーション",
  editing: "編集",
  general: "全般",
};

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  // ? キーで開く（Shiftなし）
  useKeyboardShortcut("/", () => setOpen(true), { shift: true });

  if (!open) return null;

  const categories = ["navigation", "editing", "general"] as const;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">
            キーボードショートカット
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto p-4">
          {categories.map((category) => {
            const categoryShortcuts = shortcuts.filter((s) => s.category === category);
            if (categoryShortcuts.length === 0) return null;

            return (
              <div key={category} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-sm font-medium text-gray-500">
                  {categoryLabels[category]}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm text-gray-700">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, i) => (
                          <span key={i}>
                            <kbd className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {key}
                            </kbd>
                            {i < shortcut.keys.length - 1 && shortcut.keys[i + 1] !== "/" && (
                              <span className="mx-0.5 text-gray-400">+</span>
                            )}
                            {shortcut.keys[i + 1] === "/" && (
                              <span className="mx-1 text-gray-400">/</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5">Esc</kbd> または背景をクリックして閉じる
        </div>
      </div>
    </div>
  );
}
