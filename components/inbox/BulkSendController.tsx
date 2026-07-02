"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/actions/inbox";
import type { StaffRole } from "@/lib/supabase/types";
import { InboxList } from "./InboxList";
import { BulkComposeModal } from "./BulkComposeModal";
import { BulkAiModal } from "./BulkAiModal";
import { BulkReviewPanel, type BulkTargetUser } from "./BulkReviewPanel";
import { EmptyState } from "@/components/common/EmptyState";

type ReviewState =
  | { mode: "same"; initialText: string }
  | { mode: "ai"; instruction?: string };

type BulkSendControllerProps = {
  items: InboxItem[];
  selectedUserId?: string;
  role?: StaffRole;
};

/**
 * 受信トレイの「まとめて送信」一式。
 * 選択モードのトグル・全選択・下部アクションバー・本文作成/AI開始モーダル・
 * レビューキューの配線を担う（一覧のスクロール領域ごとレンダリングする）。
 */
export function BulkSendController({ items, selectedUserId, role }: BulkSendControllerProps) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);

  // 表示中アイテムのうち選択されているもの（フィルタ変更で消えたIDは自然に落ちる）
  const selectedItems = useMemo(
    () => items.filter((item) => checked.has(item.id)),
    [items, checked]
  );

  const targets: BulkTargetUser[] = useMemo(
    () =>
      selectedItems.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        planCode: item.planCode,
        lastMessageBody: item.lastMessageBody,
        lastMessageDirection: item.lastMessageDirection,
      })),
    [selectedItems]
  );

  const toggleCheck = useCallback((userId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setChecked(new Set(items.map((item) => item.id)));
  }, [items]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setChecked(new Set());
  }, []);

  const handleReviewClose = useCallback(
    (didSendAny: boolean) => {
      setReview(null);
      if (didSendAny) {
        exitSelection();
        // 返信状態・今日の送信数などを一覧へ反映
        router.refresh();
      }
    },
    [exitSelection, router]
  );

  const count = selectedItems.length;
  const allVisibleSelected = items.length > 0 && count === items.length;

  return (
    <>
      {/* ツールバー */}
      {(items.length > 0 || selectionMode) && (
        <div className="shrink-0 border-b border-stone-100 px-3 py-2">
          {selectionMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-terracotta">{count}人選択中</span>
              <button
                type="button"
                onClick={allVisibleSelected ? () => setChecked(new Set()) : selectAllVisible}
                className="whitespace-nowrap rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
              >
                {allVisibleSelected ? "選択を解除" : `表示中の${items.length}人を全選択`}
              </button>
              <button
                type="button"
                onClick={exitSelection}
                className="ml-auto whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                まとめて送信
              </button>
            </div>
          )}
          {selectionMode && (
            <p className="mt-1.5 text-[11px] text-stone-400">
              フィルタ（未返信・今日未送信など）で絞ってから全選択すると速いです
            </p>
          )}
        </div>
      )}

      {/* 一覧（スクロール領域） */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.length > 0 ? (
          <InboxList
            items={items}
            selectedUserId={selectedUserId}
            role={role}
            selectionMode={selectionMode}
            checkedIds={checked}
            onToggleCheck={toggleCheck}
          />
        ) : (
          <div className="p-6">
            <EmptyState
              title="該当するユーザーがいません"
              description="フィルタ条件を変更してみてください"
            />
          </div>
        )}
      </div>

      {/* 下部アクションバー（選択モード時のみ） */}
      {selectionMode && (
        <div className="flex shrink-0 items-center gap-2 border-t border-stone-200 bg-white px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            disabled={count === 0}
            className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            同じ内容を送信
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            disabled={count === 0}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-terracotta px-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden>✨</span>
            AIで下書き生成
          </button>
        </div>
      )}

      {/* 本文作成 → レビューへ */}
      {composeOpen && (
        <BulkComposeModal
          count={count}
          onCancel={() => setComposeOpen(false)}
          onProceed={(text) => {
            setComposeOpen(false);
            setReview({ mode: "same", initialText: text });
          }}
        />
      )}

      {/* AI開始 → レビューへ（生成しながら確認） */}
      {aiOpen && (
        <BulkAiModal
          count={count}
          onCancel={() => setAiOpen(false)}
          onStart={(instruction) => {
            setAiOpen(false);
            setReview({ mode: "ai", instruction });
          }}
        />
      )}

      {/* レビューキュー */}
      {review && targets.length > 0 && (
        <BulkReviewPanel
          mode={review.mode}
          users={targets}
          initialText={review.mode === "same" ? review.initialText : undefined}
          instruction={review.mode === "ai" ? review.instruction : undefined}
          onClose={handleReviewClose}
        />
      )}
    </>
  );
}
