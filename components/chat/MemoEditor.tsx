"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getUserMemos,
  upsertMemo,
  MEMO_CATEGORIES,
  type Memo,
} from "@/actions/memos";
import { useToast } from "@/components/common/Toast";

type MemoEditorProps = {
  endUserId: string;
};

export function MemoEditor({ endUserId }: MemoEditorProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [isNewMemo, setIsNewMemo] = useState(false);

  // フォーム状態
  const [formCategory, setFormCategory] = useState("profile");
  const [formPinned, setFormPinned] = useState(false);
  const [formBody, setFormBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadMemos = useCallback(async () => {
    const result = await getUserMemos(endUserId);
    if (result.ok) {
      setMemos(result.data.memos);
    }
    setLoading(false);
  }, [endUserId]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  const openNewMemo = () => {
    setIsNewMemo(true);
    setEditingMemo(null);
    setFormCategory("profile");
    setFormPinned(false);
    setFormBody("");
    setIsExpanded(true);
  };

  const openEditMemo = (memo: Memo) => {
    setIsNewMemo(false);
    setEditingMemo(memo);
    setFormCategory(memo.category);
    setFormPinned(memo.pinned);
    setFormBody(memo.body);
    setIsExpanded(true);
  };

  const closeEditor = () => {
    setEditingMemo(null);
    setIsNewMemo(false);
    setIsExpanded(false);
  };

  const handleSubmit = async () => {
    if (!formBody.trim()) {
      showToast("メモ内容を入力してください", "error");
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsertMemo({
        endUserId,
        category: formCategory,
        pinned: formPinned,
        body: formBody,
      });

      if (result.ok) {
        showToast("メモを保存しました", "success");
        closeEditor();
        await loadMemos();
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("保存に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ピン留めメモのみを表示（サイドパネルに既にあるので重複を避ける）
  const allMemos = memos;

  return (
    <>
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-stone-800">メモ編集</h3>
          <button
            onClick={openNewMemo}
            className="rounded-lg bg-terracotta/10 px-2.5 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/20 transition-colors"
          >
            + 追加
          </button>
        </div>

        {/* 編集フォーム */}
        {isExpanded && (isNewMemo || editingMemo) && (
          <div className="mb-3 rounded-xl border border-terracotta/20 bg-terracotta/5 p-3">
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  disabled={!!editingMemo}
                  className="flex-1 rounded-lg border-stone-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta disabled:bg-stone-100"
                >
                  {MEMO_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formPinned}
                    onChange={(e) => setFormPinned(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-terracotta focus:ring-terracotta"
                  />
                  <span className="text-stone-700">📌</span>
                </label>
              </div>

              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                className="w-full rounded-lg border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
                rows={3}
                maxLength={5000}
                placeholder="メモ内容..."
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeEditor}
                  disabled={submitting}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  閉じる
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !formBody.trim()}
                  className="rounded-lg bg-terracotta px-3 py-1.5 text-xs font-bold text-white hover:bg-[#d0694e] disabled:opacity-50 shadow-sm"
                >
                  {submitting ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* メモ一覧 */}
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-12 rounded-xl bg-stone-100" />
            <div className="h-12 rounded-xl bg-stone-100" />
          </div>
        ) : allMemos.length > 0 ? (
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {allMemos.map((memo) => (
              <div
                key={memo.id}
                className={`cursor-pointer rounded-xl border p-3 transition-all hover:shadow-sm ${
                  memo.pinned 
                    ? "border-yellow-200 bg-yellow-50/50" 
                    : "border-stone-100 bg-stone-50 hover:bg-white hover:border-stone-200"
                }`}
                onClick={() => openEditMemo(memo)}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  {memo.pinned && <span className="text-xs">📌</span>}
                  <span className="text-xs font-bold text-stone-600">
                    {memo.categoryLabel}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-stone-700 leading-relaxed">{memo.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400 text-center py-4">メモはありません</p>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
