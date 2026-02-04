"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  getUserMemos,
  getMemoRevisions,
  upsertMemo,
  deleteMemo,
  MEMO_CATEGORIES,
  type Memo,
  type MemoRevision,
} from "@/actions/memos";
import { useToast } from "@/components/common/Toast";
import { SaveStatus } from "@/components/common/SaveStatus";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

type MemoSectionProps = {
  endUserId: string;
};

export function MemoSection({ endUserId }: MemoSectionProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [isNewMemo, setIsNewMemo] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<MemoRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);

  // フォーム状態
  const [formCategory, setFormCategory] = useState("");
  const [formPinned, setFormPinned] = useState(false);
  const [formBody, setFormBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousFormDataRef = useRef<{ category: string; pinned: boolean; body: string } | null>(null);
  const pendingDeleteRef = useRef<{ memoId: string; timeout: NodeJS.Timeout } | null>(null);

  useEffect(() => {
    loadMemos();
  }, [endUserId]);

  const loadMemos = async () => {
    const result = await getUserMemos(endUserId);
    if (result.ok) {
      setMemos(result.data.memos);
    }
    setLoading(false);
  };

  const openNewMemo = () => {
    setIsNewMemo(true);
    setEditingMemo(null);
    setFormCategory("profile");
    setFormPinned(false);
    setFormBody("");
  };

  const openEditMemo = (memo: Memo) => {
    setIsNewMemo(false);
    setEditingMemo(memo);
    setFormCategory(memo.category);
    setFormPinned(memo.pinned);
    setFormBody(memo.body);
  };

  const closeEditor = () => {
    setEditingMemo(null);
    setIsNewMemo(false);
    setAutoSaveStatus("idle");
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
  };

  // 自動保存（編集中のメモのみ）
  useEffect(() => {
    if (!editingMemo || isNewMemo) return;
    if (!formBody.trim()) return;

    // 初回は保存しない
    if (!previousFormDataRef.current) {
      previousFormDataRef.current = { category: formCategory, pinned: formPinned, body: formBody };
      return;
    }

    // 変更がない場合はスキップ
    const prev = previousFormDataRef.current;
    if (prev.category === formCategory && prev.pinned === formPinned && prev.body === formBody) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setAutoSaveStatus("idle");
    autoSaveTimeoutRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const result = await upsertMemo({
          endUserId,
          category: formCategory,
          pinned: formPinned,
          body: formBody,
        });

        if (result.ok) {
          setAutoSaveStatus("saved");
          previousFormDataRef.current = { category: formCategory, pinned: formPinned, body: formBody };
          // メモ一覧を更新
          setMemos((prev) =>
            prev.map((m) =>
              m.id === editingMemo.id
                ? { ...m, pinned: formPinned, body: formBody, updatedAt: new Date().toISOString() }
                : m
            )
          );
          setTimeout(() => setAutoSaveStatus("idle"), 2000);
        } else {
          setAutoSaveStatus("error");
        }
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formCategory, formPinned, formBody, editingMemo, isNewMemo, endUserId]);

  // 編集開始時に前回の値を記録
  useEffect(() => {
    if (editingMemo) {
      previousFormDataRef.current = { category: formCategory, pinned: formPinned, body: formBody };
    } else {
      previousFormDataRef.current = null;
    }
  }, [editingMemo?.id]);

  // 未保存警告
  useEffect(() => {
    if (!isNewMemo && !editingMemo) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formBody.trim()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isNewMemo, editingMemo, formBody]);

  const handleSubmit = useCallback(async () => {
    if (!formBody.trim()) {
      showToast("メモ内容を入力してください", "error");
      return;
    }

    // 自動保存タイマーをクリア
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setSubmitting(true);

    // 楽観的更新用のデータを準備
    const optimisticId = `temp-${Date.now()}`;
    const categoryLabel = MEMO_CATEGORIES.find((c) => c.value === formCategory)?.label ?? formCategory;
    const optimisticMemo: Memo = {
      id: editingMemo?.id ?? optimisticId,
      endUserId,
      category: formCategory,
      categoryLabel,
      pinned: formPinned,
      body: formBody,
      updatedAt: new Date().toISOString(),
    };

    // 楽観的更新: UIを即座に更新
    const previousMemos = [...memos];
    if (isNewMemo) {
      setMemos((prev) => [optimisticMemo, ...prev]);
    } else {
      setMemos((prev) =>
        prev.map((m) => (m.id === editingMemo?.id ? optimisticMemo : m))
      );
    }
    closeEditor();

    try {
      const result = await upsertMemo({
        endUserId,
        category: formCategory,
        pinned: formPinned,
        body: formBody,
      });

      if (result.ok) {
        // 成功: 一時IDを実際のIDで置き換え
        if (isNewMemo) {
          setMemos((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, id: result.data.memoId } : m
            )
          );
        }
        showToast("メモを保存しました", "success");
        router.refresh();
      } else {
        // 失敗: ロールバック
        setMemos(previousMemos);
        showToast(result.error.message, "error");
      }
    } catch {
      // エラー: ロールバック
      setMemos(previousMemos);
      showToast("保存に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  }, [formBody, formCategory, formPinned, editingMemo, isNewMemo, memos, endUserId, showToast, router]);

  // Cmd/Ctrl + S で保存
  useKeyboardShortcut("s", () => {
    if ((isNewMemo || editingMemo) && formBody.trim() && !submitting) {
      handleSubmit();
    }
  }, { meta: true, enableInInput: true });

  // Escape でエディタを閉じる
  useKeyboardShortcut("Escape", () => {
    if (isNewMemo || editingMemo) {
      closeEditor();
    }
  }, { enableInInput: true });

  // メモ削除（Undo対応）
  const handleDelete = useCallback((memo: Memo) => {
    // 既存の削除がペンディング中なら何もしない
    if (pendingDeleteRef.current) {
      return;
    }

    // 楽観的削除: UIから即座に削除
    const previousMemos = [...memos];
    setMemos((prev) => prev.filter((m) => m.id !== memo.id));

    // Undoハンドラ
    const handleUndo = () => {
      // ペンディング削除をキャンセル
      if (pendingDeleteRef.current?.memoId === memo.id) {
        clearTimeout(pendingDeleteRef.current.timeout);
        pendingDeleteRef.current = null;
      }
      // UIに戻す
      setMemos(previousMemos);
      showToast("メモを復元しました", "info");
    };

    // 5秒後に実際に削除
    const deleteTimeout = setTimeout(async () => {
      pendingDeleteRef.current = null;
      const result = await deleteMemo({ memoId: memo.id });
      if (result.ok) {
        router.refresh();
      } else {
        // 削除失敗時はUIに戻す
        setMemos(previousMemos);
        showToast(result.error.message, "error");
      }
    }, 5000);

    pendingDeleteRef.current = { memoId: memo.id, timeout: deleteTimeout };

    // Undo付きトースト表示
    showToast("メモを削除しました", "success", {
      onUndo: handleUndo,
      duration: 5000,
    });
  }, [memos, showToast, router]);

  const loadRevisions = async (memoId: string) => {
    if (showHistory === memoId) {
      setShowHistory(null);
      return;
    }

    setShowHistory(memoId);
    setLoadingRevisions(true);
    const result = await getMemoRevisions(memoId);
    if (result.ok) {
      setRevisions(result.data.revisions);
    } else {
      showToast("履歴の取得に失敗しました", "error");
    }
    setLoadingRevisions(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-bold text-stone-800">メモ</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-20 rounded-xl bg-stone-100" />
          <div className="h-20 rounded-xl bg-stone-100" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-800">メモ</h2>
          <button
            onClick={openNewMemo}
            className="rounded-xl bg-terracotta px-3 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] transition-colors"
          >
            + 追加
          </button>
        </div>

        {/* 新規/編集フォーム */}
        {(isNewMemo || editingMemo) && (
          <div className="mb-4 rounded-xl border border-terracotta/20 bg-terracotta/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-stone-800">
                {isNewMemo ? "新規メモ" : "メモを編集"}
              </h3>
              {editingMemo && !isNewMemo && (
                <SaveStatus status={autoSaveStatus} className="text-xs" />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-sm font-bold text-stone-700">
                    カテゴリ
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    disabled={!!editingMemo}
                    className="mt-1 block w-full rounded-xl border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta disabled:bg-stone-100"
                  >
                    {MEMO_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  {editingMemo && (
                    <p className="mt-1 text-xs text-stone-500">
                      カテゴリは変更できません
                    </p>
                  )}
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPinned}
                      onChange={(e) => setFormPinned(e.target.checked)}
                      className="h-4 w-4 rounded border-stone-300 text-terracotta focus:ring-terracotta"
                    />
                    <span className="text-stone-700">📌 ピン留め</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700">
                  内容
                </label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="mt-1 block w-full rounded-xl border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
                  rows={4}
                  maxLength={5000}
                  placeholder="メモ内容を入力... (Cmd+Sで保存, Escでキャンセル)"
                />
                <p className="mt-1 text-xs text-stone-500">
                  {formBody.length} / 5000文字
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={submitting}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !formBody.trim()}
                  className="rounded-xl bg-terracotta px-3 py-1.5 text-sm font-bold text-white hover:bg-[#d0694e] disabled:opacity-50 shadow-sm"
                >
                  {submitting ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* メモ一覧 */}
        {memos.length > 0 ? (
          <div className="space-y-3">
            {memos.map((memo) => (
              <div key={memo.id}>
                <div
                  className={`rounded-xl border p-4 transition-all ${
                    memo.pinned 
                      ? "border-yellow-200 bg-yellow-50/50 shadow-sm" 
                      : "border-stone-100 bg-stone-50 hover:border-stone-200"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {memo.pinned && <span>📌</span>}
                      <span className="text-sm font-bold text-stone-700">
                        {memo.categoryLabel}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => loadRevisions(memo.id)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-200 transition-colors"
                      >
                        履歴
                      </button>
                      <button
                        onClick={() => openEditMemo(memo)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-terracotta hover:bg-terracotta/10 transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(memo)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-stone-600 leading-relaxed">
                    {memo.body}
                  </p>
                  <p className="mt-2 text-xs text-stone-400">
                    更新: {format(new Date(memo.updatedAt), "yyyy/MM/dd HH:mm", { locale: ja })}
                  </p>
                </div>

                {/* 編集履歴 */}
                {showHistory === memo.id && (
                  <div className="ml-4 mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                    <h4 className="mb-2 text-sm font-bold text-stone-700">
                      編集履歴
                    </h4>
                    {loadingRevisions ? (
                      <p className="text-sm text-stone-400">読み込み中...</p>
                    ) : revisions.length > 0 ? (
                      <div className="max-h-60 space-y-2 overflow-y-auto pr-2">
                        {revisions.map((rev) => (
                          <div
                            key={rev.id}
                            className="rounded-lg border border-stone-100 p-3 bg-stone-50/50"
                          >
                            <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                              <span className="font-medium">{rev.editedByName}</span>
                              <span>
                                {format(new Date(rev.createdAt), "yyyy/MM/dd HH:mm", { locale: ja })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-xs text-stone-600">
                              {rev.body.slice(0, 200)}
                              {rev.body.length > 200 && "..."}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-stone-400">履歴がありません</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 mb-3">
              <svg className="h-6 w-6 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <p className="text-sm text-stone-500">メモはまだありません</p>
          </div>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
