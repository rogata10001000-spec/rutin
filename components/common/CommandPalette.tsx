"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

type Command = {
  id: string;
  label: string;
  description?: string;
  path?: string;
  action?: () => void;
  icon: string;
  keywords?: string[];
};

const defaultCommands: Command[] = [
  // ナビゲーション
  { id: "inbox", label: "インボックス", path: "/inbox", icon: "📥", keywords: ["inbox", "未返信", "対応"] },
  { id: "users", label: "ユーザー一覧", path: "/users", icon: "👥", keywords: ["user", "ユーザー", "一覧"] },
  { id: "audit", label: "監査ログ", path: "/admin/audit", icon: "📋", keywords: ["audit", "監査", "ログ"] },
  { id: "staff", label: "スタッフ管理", path: "/admin/staff", icon: "👤", keywords: ["staff", "スタッフ"] },
  { id: "pricing", label: "価格設定", path: "/admin/pricing", icon: "💰", keywords: ["price", "価格", "料金"] },
  { id: "settlements", label: "精算", path: "/admin/settlements", icon: "💵", keywords: ["settlement", "精算", "支払い"] },
  { id: "payout-rules", label: "配分ルール", path: "/admin/payout-rules", icon: "📊", keywords: ["payout", "配分", "ルール"] },
  { id: "gifts", label: "ギフト管理", path: "/admin/gifts", icon: "🎁", keywords: ["gift", "ギフト", "ポイント"] },
  { id: "plans", label: "プラン管理", path: "/admin/plans", icon: "📝", keywords: ["plan", "プラン"] },
  { id: "tax-rates", label: "税率管理", path: "/admin/tax-rates", icon: "🧾", keywords: ["tax", "税率"] },
  { id: "webhooks", label: "Webhook履歴", path: "/admin/webhooks", icon: "🔗", keywords: ["webhook", "ウェブフック"] },
];

type CommandPaletteProps = {
  additionalCommands?: Command[];
};

export function CommandPalette({ additionalCommands = [] }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = [...defaultCommands, ...additionalCommands];

  // フィルタリング
  const filteredCommands = query
    ? commands.filter((cmd) => {
        const searchText = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(searchText) ||
          cmd.description?.toLowerCase().includes(searchText) ||
          cmd.keywords?.some((k) => k.toLowerCase().includes(searchText))
        );
      })
    : commands;

  // Cmd/Ctrl + K で開く
  useKeyboardShortcut("k", () => setOpen(true), { meta: true });

  // 開いたときの初期化
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // 選択変更時にスクロール
  useEffect(() => {
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, filteredCommands.length]);

  // 検索クエリ変更時に選択をリセット
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (command: Command) => {
      setOpen(false);
      if (command.path) {
        router.push(command.path);
      } else if (command.action) {
        command.action();
      }
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleSelect(filteredCommands[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/4 w-full max-w-lg -translate-x-1/2 rounded-lg bg-white shadow-2xl">
        {/* Search input */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ページを検索..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="hidden rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 sm:inline-block">
              esc
            </kbd>
          </div>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => handleSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg">{cmd.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{cmd.label}</p>
                  {cmd.description && (
                    <p className="text-xs text-gray-500">{cmd.description}</p>
                  )}
                </div>
                {index === selectedIndex && (
                  <kbd className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                    enter
                  </kbd>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              「{query}」に一致するコマンドがありません
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex gap-3">
              <span>
                <kbd className="rounded bg-gray-200 px-1.5 py-0.5">↑↓</kbd> 移動
              </span>
              <span>
                <kbd className="rounded bg-gray-200 px-1.5 py-0.5">enter</kbd> 選択
              </span>
              <span>
                <kbd className="rounded bg-gray-200 px-1.5 py-0.5">esc</kbd> 閉じる
              </span>
            </div>
            <span>
              <kbd className="rounded bg-gray-200 px-1.5 py-0.5">?</kbd> ショートカット一覧
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
