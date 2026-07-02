"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sendMessage } from "@/actions/messages";
import { generateAiDrafts, type AiDraft } from "@/actions/ai";
import { BadgePlan } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

export type BulkTargetUser = {
  id: string;
  displayName: string;
  planCode: "light" | "standard" | "premium";
  lastMessageBody: string | null;
  lastMessageDirection: "in" | "out" | null;
};

type ItemStatus =
  | "generating" // AI生成中
  | "genError" // AI生成失敗（再試行可）
  | "ready" // 下書きあり・未送信
  | "sending"
  | "sent"
  | "failed" // 送信失敗（再試行可）
  | "skipped";

type QueueItem = {
  user: BulkTargetUser;
  text: string;
  variants: AiDraft[] | null;
  status: ItemStatus;
  error: string | null;
};

type BulkReviewPanelProps = {
  mode: "same" | "ai";
  users: BulkTargetUser[];
  /** mode=same のときの本文（{名前} プレースホルダ対応） */
  initialText?: string;
  /** mode=ai のときの共通指示（任意） */
  instruction?: string;
  onClose: (didSendAny: boolean) => void;
};

const VARIANT_LABELS: Record<AiDraft["type"], string> = {
  empathy: "共感",
  praise: "称賛",
  suggest: "提案",
};

/** {名前} を各ユーザーの表示名に置き換える */
export function applyNamePlaceholder(text: string, displayName: string): string {
  return text.replaceAll("{名前}", displayName);
}

/** 並列数を制限して非同期処理を実行する小さなプール */
async function runPool(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
  isCancelled: () => boolean
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (next < total && !isCancelled()) {
      const index = next;
      next += 1;
      await worker(index);
    }
  });
  await Promise.all(runners);
}

const PENDING_STATUSES: ItemStatus[] = ["generating", "genError", "ready", "sending", "failed"];

export function BulkReviewPanel({
  mode,
  users,
  initialText = "",
  instruction,
  onClose,
}: BulkReviewPanelProps) {
  const { showToast, ToastContainer } = useToast();

  const [items, setItems] = useState<QueueItem[]>(() =>
    users.map((user) => ({
      user,
      text: mode === "same" ? applyNamePlaceholder(initialText, user.displayName) : "",
      variants: null,
      status: mode === "same" ? "ready" : "generating",
      error: null,
    }))
  );
  const [current, setCurrent] = useState(0);
  const [doneView, setDoneView] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmSendAllOpen, setConfirmSendAllOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  // 非同期処理から最新の items を読むためのミラー
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const cancelledRef = useRef(false);
  const didSendRef = useRef(false);
  const bulkCancelRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      bulkCancelRef.current = true;
    };
  }, []);

  // 背景スクロールを止める（全画面パネル）
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const updateItem = useCallback((index: number, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  // ===== AI生成（1人ずつ・並列2・終わった人からレビュー可能） =====
  const generateFor = useCallback(
    async (index: number) => {
      const user = itemsRef.current[index]?.user;
      if (!user) return;
      updateItem(index, { status: "generating", error: null });
      const result = await generateAiDrafts({ endUserId: user.id, instruction });
      if (cancelledRef.current) return;
      if (result.ok && result.data.drafts.length > 0) {
        const drafts = result.data.drafts;
        const preferred = drafts.find((d) => d.type === "empathy") ?? drafts[0];
        updateItem(index, {
          status: "ready",
          variants: drafts,
          text: preferred.body,
        });
      } else {
        updateItem(index, {
          status: "genError",
          error: result.ok ? "下書きを生成できませんでした" : result.error.message,
        });
      }
    },
    [instruction, updateItem]
  );

  useEffect(() => {
    if (mode !== "ai") return;
    void runPool(users.length, 2, generateFor, () => cancelledRef.current);
    // 初回マウント時のみ実行（users/modeはパネルの寿命中不変）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 送信 =====
  const findNextPending = useCallback((from: number): number | null => {
    const list = itemsRef.current;
    for (let step = 1; step <= list.length; step += 1) {
      const i = (from + step) % list.length;
      if (PENDING_STATUSES.includes(list[i].status)) return i;
    }
    return null;
  }, []);

  const sendOne = useCallback(
    async (index: number): Promise<boolean> => {
      const item = itemsRef.current[index];
      if (!item) return false;
      const body = item.text.trim();
      if (!body) return false;
      updateItem(index, { status: "sending", error: null });
      const result = await sendMessage({ endUserId: item.user.id, body });
      if (result.ok) {
        didSendRef.current = true;
        updateItem(index, { status: "sent" });
        return true;
      }
      updateItem(index, { status: "failed", error: result.error.message });
      return false;
    },
    [updateItem]
  );

  const handleSendCurrent = useCallback(async () => {
    const index = current;
    const ok = await sendOne(index);
    if (!ok) {
      const msg = itemsRef.current[index]?.error ?? "送信に失敗しました";
      showToast(msg, "error");
      return;
    }
    const next = findNextPending(index);
    if (next === null) {
      setDoneView(true);
    } else {
      setCurrent(next);
    }
  }, [current, sendOne, findNextPending, showToast]);

  const handleSkip = useCallback(() => {
    updateItem(current, { status: "skipped" });
    const next = findNextPending(current);
    if (next === null) {
      setDoneView(true);
    } else {
      setCurrent(next);
    }
  }, [current, updateItem, findNextPending]);

  // 残りすべて送信（ready / failed のうち本文があるもの）
  const sendableCount = useMemo(
    () =>
      items.filter((it) => (it.status === "ready" || it.status === "failed") && it.text.trim())
        .length,
    [items]
  );

  const handleSendAll = useCallback(async () => {
    setConfirmSendAllOpen(false);
    bulkCancelRef.current = false;
    const targets = itemsRef.current
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => (it.status === "ready" || it.status === "failed") && it.text.trim())
      .map(({ i }) => i);
    if (targets.length === 0) return;

    setBulkSending(true);
    setBulkProgress({ done: 0, total: targets.length });
    let done = 0;
    await runPool(
      targets.length,
      2,
      async (poolIndex) => {
        await sendOne(targets[poolIndex]);
        done += 1;
        setBulkProgress({ done, total: targets.length });
      },
      () => bulkCancelRef.current
    );
    setBulkSending(false);
    setBulkProgress(null);

    const failed = itemsRef.current.filter((it) => it.status === "failed").length;
    if (failed > 0) {
      showToast(`${failed}人への送信に失敗しました。個別に再試行できます`, "error");
    }
    if (findNextPending(-1) === null) {
      setDoneView(true);
    }
  }, [sendOne, findNextPending, showToast]);

  // ===== 閉じる =====
  const unsentCount = useMemo(
    () => items.filter((it) => PENDING_STATUSES.includes(it.status)).length,
    [items]
  );

  const requestClose = useCallback(() => {
    if (bulkSending) return; // 一括送信中は閉じない（中断ボタンで止める）
    if (!doneView && unsentCount > 0) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose(didSendRef.current);
  }, [bulkSending, doneView, unsentCount, onClose]);

  // ===== 集計 =====
  const sentCount = items.filter((it) => it.status === "sent").length;
  const skippedCount = items.filter((it) => it.status === "skipped").length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const generatingCount = items.filter((it) => it.status === "generating").length;
  const progressPct = items.length > 0 ? Math.round((sentCount / items.length) * 100) : 0;

  const item = items[current];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (item?.status === "ready" || item?.status === "failed") {
          void handleSendCurrent();
        }
      }
    },
    [item?.status, handleSendCurrent]
  );

  const goPrev = () => setCurrent((c) => (c - 1 + items.length) % items.length);
  const goNext = () => setCurrent((c) => (c + 1) % items.length);

  const firstSkipped = items.findIndex((it) => it.status === "skipped");

  const panel = (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={requestClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "ai" ? "AI下書きの確認と送信" : "一斉送信の確認"}
        className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white sm:h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:shadow-soft-lg"
      >
        {/* ヘッダー: 進捗 + 一括送信 + 閉じる */}
        <div className="shrink-0 border-b border-stone-100 bg-stone-50/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-stone-800">
                {mode === "ai" ? "AI下書きを確認して送信" : "内容を確認して送信"}
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                送信済み {sentCount} / {items.length} 人
                {generatingCount > 0 && `（AI生成中 ${generatingCount}人）`}
                {skippedCount > 0 && ` ・スキップ ${skippedCount}`}
                {failedCount > 0 && ` ・失敗 ${failedCount}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {bulkSending ? (
                <button
                  type="button"
                  onClick={() => {
                    bulkCancelRef.current = true;
                  }}
                  className="whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50"
                >
                  中断（{bulkProgress?.done ?? 0}/{bulkProgress?.total ?? 0}）
                </button>
              ) : (
                sendableCount > 1 &&
                !doneView && (
                  <button
                    type="button"
                    onClick={() => setConfirmSendAllOpen(true)}
                    className="whitespace-nowrap rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 py-1.5 text-xs font-bold text-terracotta transition-colors hover:bg-terracotta/10"
                  >
                    残り{sendableCount}人にすべて送信
                  </button>
                )
              )}
              <button
                type="button"
                onClick={requestClose}
                aria-label="閉じる"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-terracotta transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {doneView ? (
          /* ===== 完了ビュー ===== */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto overscroll-contain p-6 text-center">
            <div className="rounded-full bg-emerald-100 p-4 text-emerald-600">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-stone-800">{sentCount}人に送信しました</p>
              {(skippedCount > 0 || failedCount > 0) && (
                <p className="mt-1 text-sm text-stone-500">
                  {skippedCount > 0 && `スキップ ${skippedCount}人`}
                  {skippedCount > 0 && failedCount > 0 && " ・ "}
                  {failedCount > 0 && `送信失敗 ${failedCount}人`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(skippedCount > 0 || failedCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    const target =
                      items.findIndex((it) => it.status === "failed") >= 0
                        ? items.findIndex((it) => it.status === "failed")
                        : firstSkipped;
                    if (target >= 0) {
                      setCurrent(target);
                      setDoneView(false);
                    }
                  }}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 shadow-sm hover:bg-stone-50"
                >
                  スキップ・失敗分を確認
                </button>
              )}
              <button
                type="button"
                onClick={() => onClose(didSendRef.current)}
                className="rounded-xl bg-terracotta px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e]"
              >
                閉じる
              </button>
            </div>
          </div>
        ) : item ? (
          <>
            {/* ===== ナビ ===== */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-4 py-2">
              <button
                type="button"
                onClick={goPrev}
                aria-label="前のユーザー"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs tabular-nums text-stone-400">
                  {current + 1}/{items.length}
                </span>
                <span className="truncate font-bold text-stone-800">{item.user.displayName}</span>
                <span className="shrink-0">
                  <BadgePlan plan={item.user.planCode} />
                </span>
                {item.status === "sent" && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    送信済み
                  </span>
                )}
                {item.status === "skipped" && (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">
                    スキップ
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={goNext}
                aria-label="次のユーザー"
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* ===== 本文 ===== */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
              {/* 相手の文脈 */}
              {item.user.lastMessageBody && (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    直近のメッセージ
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-stone-600">
                    {item.user.lastMessageDirection === "out" ? "自分: " : "相手: "}
                    {item.user.lastMessageBody}
                  </p>
                </div>
              )}

              {/* AI候補の切り替え */}
              {mode === "ai" && item.variants && item.variants.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-stone-400">候補:</span>
                  {item.variants.map((v) => (
                    <button
                      key={v.type}
                      type="button"
                      onClick={() => updateItem(current, { text: v.body })}
                      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        item.text === v.body
                          ? "border-terracotta bg-terracotta/10 text-terracotta"
                          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      {VARIANT_LABELS[v.type]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void generateFor(current)}
                    className="ml-auto whitespace-nowrap text-xs font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
                  >
                    AIで再生成
                  </button>
                </div>
              )}

              {/* 状態表示 */}
              {item.status === "generating" && (
                <div className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  <svg className="h-5 w-5 animate-spin text-terracotta" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  この人の会話履歴・メモをもとにAIが下書きを作成しています…
                </div>
              )}
              {item.status === "genError" && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p>下書きを生成できませんでした：{item.error}</p>
                  <button
                    type="button"
                    onClick={() => void generateFor(current)}
                    className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    再試行
                  </button>
                </div>
              )}
              {item.status === "failed" && item.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  送信に失敗しました：{item.error}。内容を確認して再度お試しください。
                </div>
              )}

              {/* 下書き本文（編集可） */}
              {item.status !== "generating" && item.status !== "genError" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <textarea
                    value={item.text}
                    onChange={(e) => updateItem(current, { text: e.target.value })}
                    onKeyDown={handleKeyDown}
                    readOnly={item.status === "sent" || bulkSending}
                    rows={6}
                    placeholder="送信する内容を入力…"
                    className={`block min-h-[10rem] w-full flex-1 resize-none rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-sm transition-all focus:outline-none ${
                      item.status === "sent"
                        ? "border-emerald-200 bg-emerald-50/50 text-stone-500"
                        : "border-stone-200 bg-stone-50 text-stone-900 focus:border-terracotta focus:bg-white focus:ring-1 focus:ring-terracotta"
                    }`}
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400">
                    <span className="hidden sm:inline">⌘/Ctrl + Enter で送信して次へ</span>
                    <span className="tabular-nums">{item.text.length}文字</span>
                  </div>
                </div>
              )}
            </div>

            {/* ===== フッター操作 ===== */}
            <div className="shrink-0 border-t border-stone-100 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {item.status === "sent" ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = findNextPending(current);
                    if (next === null) {
                      setDoneView(true);
                    } else {
                      setCurrent(next);
                    }
                  }}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-stone-800 text-sm font-bold text-white transition-colors hover:bg-stone-700"
                >
                  次の未送信へ
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={bulkSending || item.status === "sending"}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-50"
                  >
                    スキップ
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendCurrent()}
                    disabled={
                      bulkSending ||
                      item.status === "sending" ||
                      item.status === "generating" ||
                      item.status === "genError" ||
                      !item.text.trim()
                    }
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item.status === "sending" ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        送信中…
                      </>
                    ) : item.status === "failed" ? (
                      "再送信して次へ"
                    ) : (
                      "送信して次へ"
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* 一括送信の確認 */}
      <ConfirmDialog
        open={confirmSendAllOpen}
        title={`残り${sendableCount}人にまとめて送信しますか？`}
        description="現在の下書きの内容のまま、確認せずに順番に送信します。送信後は取り消せません。"
        confirmLabel={`${sendableCount}人に送信する`}
        variant="default"
        onConfirm={() => void handleSendAll()}
        onCancel={() => setConfirmSendAllOpen(false)}
      />

      {/* 閉じる確認（未送信の下書きが残っている場合） */}
      <ConfirmDialog
        open={confirmCloseOpen}
        title="確認を終了しますか？"
        description={`未送信の下書きが${unsentCount}人分残っています。閉じると下書きは破棄されます（送信済みの${sentCount}人には影響しません）。`}
        confirmLabel="破棄して閉じる"
        variant="danger"
        onConfirm={() => {
          setConfirmCloseOpen(false);
          onClose(didSendRef.current);
        }}
        onCancel={() => setConfirmCloseOpen(false)}
      />

      <ToastContainer />
    </div>
  );

  return createPortal(panel, document.body);
}
