"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getUserMemos,
  upsertMemo,
  type Memo,
} from "@/actions/memos";
import { MEMO_CATEGORIES } from "@/lib/memo-categories";
import { useToast } from "@/components/common/Toast";
import { Select } from "@/components/common/Select";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const loadMemos = useCallback(async () => {
    const result = await getUserMemos(endUserId);
    if (result.ok) {
      setMemos(result.data.memos);
    }
    setLoading(false);
  }, [endUserId]);

  // 表示されるまでメモを取得しない。
  // 受信トレイのサイドパネルは狭い画面では `hidden`（display:none）で常時マウントされており、
  // そのまま読み込むと「見えないパネルのための取得」がスレッドを開くたびに走る
  // （モバイルで情報ドロワーを開くと2つ目のインスタンスがもう一度取得する）。
  // display:none の要素は交差しないので、IntersectionObserver で実際に見えたときだけ取得する。
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadMemos();
  }, [visible, loadMemos]);

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

    const target = editingMemo;
    const category = formCategory;
    const pinned = formPinned;
    const body = formBody;
    // ピン留めの有無が変わったときだけ、サーバー描画のピン留め一覧を取り直す必要がある。
    const pinnedChanged = target ? target.pinned !== pinned : pinned;
    const previousMemos = memos;

    // 楽観的に一覧へ反映し、保存の往復を待たずにフォームを閉じる。
    const optimisticId = target?.id ?? `pending-${crypto.randomUUID()}`;
    const optimistic: Memo = {
      id: optimisticId,
      endUserId,
      category,
      categoryLabel:
        MEMO_CATEGORIES.find((c) => c.value === category)?.label ?? category,
      pinned,
      body,
      updatedAt: new Date().toISOString(),
    };
    setMemos((prev) =>
      target
        ? prev.map((m) => (m.id === target.id ? optimistic : m))
        : [optimistic, ...prev]
    );
    closeEditor();
    setSubmitting(true);

    try {
      const result = await upsertMemo({ endUserId, category, pinned, body });

      if (result.ok) {
        showToast("メモを保存しました", "success");
        // 正式なID・更新日時・並び順に揃える（表示は既に更新済みなので待たせない）。
        void loadMemos();
        if (pinnedChanged) router.refresh();
      } else {
        setMemos(previousMemos);
        showToast(result.error.message, "error");
      }
    } catch {
      setMemos(previousMemos);
      showToast("メモを保存できませんでした。通信を確認してもう一度お試しください", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ピン留めメモのみを表示（サイドパネルに既にあるので重複を避ける）
  const allMemos = memos;

  return (
    <>
      <div
        ref={rootRef}
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft"
      >
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
                <Select
                  aria-label="メモカテゴリ"
                  size="sm"
                  className="flex-1"
                  value={formCategory}
                  onChange={setFormCategory}
                  disabled={!!editingMemo}
                  options={MEMO_CATEGORIES.map((cat) => ({ value: cat.value, label: cat.label }))}
                />
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
