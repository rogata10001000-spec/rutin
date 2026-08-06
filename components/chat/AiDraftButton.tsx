"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { generateAiDrafts, type AiDraft } from "@/actions/ai";
import { useToast } from "@/components/common/Toast";
import { applyDraftToBody, draftIndexFromKey, type DraftApplyMode } from "./aiDraftHelpers";

/** 本文へ反映した下書き（送信時の採用トラッキングに使う） */
export type AppliedDraft = { id: string; body: string };

type AiDraftButtonProps = {
  endUserId: string;
  /** コンポーザーの現在の本文。空かどうかで反映方法の選択肢を出し分ける */
  composerBody: string;
  /**
   * 本文を差し替える。draft は採用トラッキング用の下書き（元に戻すときは null）。
   * 呼び出し側（MessageComposer）が setBody と aiDraftId の保持を行う。
   */
  onApplyDraft: (nextBody: string, draft: AppliedDraft | null) => void;
  /**
   * 送信のたびに増える値。下書きは「直前の受信メッセージへの返信案」なので、
   * 返信を送った時点で古くなる。値が変わったら候補を捨てて作り直させる。
   */
  resetKey?: number;
  /**
   * 受信時に用意済みの下書き（スレッド取得のペイロードに同梱済み）。
   * 別途フェッチしないことで、スレッドを開くたびの往復を増やさない。
   */
  initialPregenerated?: AiDraft[] | null;
};

const DRAFT_TYPE_LABELS: Record<AiDraft["type"], string> = {
  empathy: "共感",
  praise: "称賛",
  suggest: "提案",
};

/** 種別ごとの配色（共感=ピンク / 称賛=イエロー / 提案=ブルー） */
const DRAFT_TYPE_STYLES: Record<
  AiDraft["type"],
  { card: string; badge: string; primary: string; outline: string }
> = {
  empathy: {
    card: "border-pink-200 bg-pink-50/70",
    badge: "bg-pink-100 text-pink-800",
    primary: "bg-pink-600 text-white hover:bg-pink-700",
    outline: "border-pink-300 bg-white text-pink-700 hover:bg-pink-50",
  },
  praise: {
    card: "border-amber-200 bg-amber-50/70",
    badge: "bg-amber-100 text-amber-800",
    primary: "bg-amber-600 text-white hover:bg-amber-700",
    outline: "border-amber-300 bg-white text-amber-700 hover:bg-amber-50",
  },
  suggest: {
    card: "border-blue-200 bg-blue-50/70",
    badge: "bg-blue-100 text-blue-800",
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border-blue-300 bg-white text-blue-700 hover:bg-blue-50",
  },
};

const PANEL_WIDTH = 384; // px（w-96 相当）
const PANEL_MARGIN = 12;

/**
 * AI下書きボタン。
 *
 * 設計の要点:
 * - スレットを開いた時点で「受信時に用意済みの下書き」を先読みし、
 *   あればクリック即表示（APIを叩かない）＝待ち時間ゼロ
 * - 事前生成が無いときも、パネルは即座にスケルトンで開く（押した反応を100ms以内に返す）
 * - 入力中の文章を黙って壊さない（空なら挿入・非空なら置き換え/末尾追加を選ばせ、必ず「元に戻す」を出す）
 * - パネルは composer の overflow-hidden な祖先に切り取られるため body 直下へ portal する
 */
export function AiDraftButton({
  endUserId,
  composerBody,
  onApplyDraft,
  resetKey = 0,
  initialPregenerated = null,
}: AiDraftButtonProps) {
  const { showToast, ToastContainer } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  const [fromPregenerated, setFromPregenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 受信時に準備済みの下書き（サーバーから同梱済み）。あればクリックで即表示できる */
  const [pregenerated, setPregenerated] = useState<AiDraft[] | null>(
    initialPregenerated && initialPregenerated.length > 0 ? initialPregenerated : null
  );
  const [instruction, setInstruction] = useState("");
  /** 反映前の本文。反映直後だけ「元に戻す」を出すために保持する */
  const [undoState, setUndoState] = useState<{ previous: string; applied: string } | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; maxHeight: number } | null>(
    null
  );
  const [isMobile, setIsMobile] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 非同期のコールバックから最新の本文を読むためのミラー
  const composerBodyRef = useRef(composerBody);
  useEffect(() => {
    composerBodyRef.current = composerBody;
  }, [composerBody]);

  const composerIsEmpty = composerBody.trim() === "";

  // ===== ユーザー切り替え時の状態リセット =====
  // 事前生成はスレッド取得のペイロードに同梱されているため、ここでは取りに行かない
  // （スレッドを開くたびの往復を増やさないための設計）。
  useEffect(() => {
    setOpen(false);
    setDrafts(null);
    setPregenerated(
      initialPregenerated && initialPregenerated.length > 0 ? initialPregenerated : null
    );
    setError(null);
    setInstruction("");
    setUndoState(null);
    // initialPregenerated はスレッド取得ごとに新しい配列になるため依存に入れない
    // （入れると同じ内容で再セットされ続ける）。ユーザー切り替えを唯一のトリガーにする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endUserId]);

  // 返信を送ったら候補を捨てる（次の受信までは「準備できています」も出さない）。
  // 再取得はしない: 次にボタンを押したときの生成が、サーバー側で新しい事前生成を拾う。
  useEffect(() => {
    if (resetKey === 0) return;
    setOpen(false);
    setDrafts(null);
    setPregenerated(null);
    setError(null);
    setUndoState(null);
  }, [resetKey]);

  // ===== 表示形態（PC=ポップオーバー / スマホ=ボトムシート） =====
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - PANEL_WIDTH - PANEL_MARGIN;
    setAnchor({
      left: Math.max(PANEL_MARGIN, Math.min(rect.left, maxLeft)),
      // ボタンの上に出す（入力欄が下にあるため）
      bottom: Math.max(PANEL_MARGIN, window.innerHeight - rect.top + 8),
      // ボタンより上に収まる高さに制限し、画面上端からはみ出さないようにする
      maxHeight: Math.max(200, rect.top - PANEL_MARGIN - 8),
    });
  }, []);

  // スクロール・リサイズ追従（capture で入れ子スクロールコンテナの移動も拾う）
  useEffect(() => {
    if (!open || isMobile) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, isMobile, updatePosition]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  // ===== 生成 =====
  const runGenerate = useCallback(
    async (rawInstruction?: string) => {
      const trimmed = rawInstruction?.trim();
      setLoading(true);
      setError(null);
      setDrafts(null);
      try {
        const result = await generateAiDrafts({
          endUserId,
          instruction: trimmed ? trimmed : undefined,
        });
        if (result.ok) {
          setDrafts(result.data.drafts);
          setFromPregenerated(result.data.fromPregenerated);
          // 新規生成した場合は先読みキャッシュが古くなるので捨てる
          if (!result.data.fromPregenerated) setPregenerated(null);
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("下書きを作成できませんでした。通信環境を確認して、もう一度お試しください");
      } finally {
        setLoading(false);
      }
    },
    [endUserId]
  );

  const openPanel = useCallback(() => {
    updatePosition();
    setError(null);
    setOpen(true);

    // 事前生成があれば待ち時間ゼロで表示（APIを呼ばない）
    if (pregenerated && pregenerated.length > 0) {
      setDrafts(pregenerated);
      setFromPregenerated(true);
      return;
    }
    // すでに生成済みなら再利用（再生成は「再生成」ボタン / r キーで明示的に行う）
    if (drafts && drafts.length > 0) return;
    void runGenerate();
  }, [drafts, pregenerated, runGenerate, updatePosition]);

  // ===== 本文への反映 =====
  const restore = useCallback(
    (previous: string) => {
      onApplyDraft(previous, null);
      setUndoState(null);
    },
    [onApplyDraft]
  );

  const applyDraft = useCallback(
    (draft: AiDraft, mode: DraftApplyMode) => {
      const previous = composerBodyRef.current;
      const next = applyDraftToBody(previous, draft.body, mode);
      onApplyDraft(next, { id: draft.id, body: draft.body });
      setUndoState({ previous, applied: next });
      closePanel();
      showToast(
        mode === "append" ? "下書きを末尾に追加しました" : "下書きを入力欄に入れました",
        "success",
        {
          onUndo: () => restore(previous),
          undoLabel: "元に戻す",
          duration: 8000,
        }
      );
    },
    [closePanel, onApplyDraft, restore, showToast]
  );

  // ===== キーボード操作（パネル表示中のみ） =====
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Esc は入力中でも効かせる。開いているときだけ先取りして
      // 親モーダルまで一緒に閉じてしまうのを防ぐ（段階クローズ）
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePanel();
        return;
      }

      // 文字入力中・修飾キー併用は横取りしない
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void runGenerate(instruction);
        return;
      }

      if (!drafts || drafts.length === 0) return;
      const index = draftIndexFromKey(e.key, drafts.length);
      if (index === null) return;
      e.preventDefault();
      // 数字キーは主操作（本文が空なら挿入・非空なら置き換え）に割り当てる。
      // 置き換えても直後のトーストとツールバーの「元に戻す」で戻せるため破壊的にはならない。
      applyDraft(drafts[index], "replace");
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, drafts, instruction, applyDraft, closePanel, runGenerate]);

  // ===== 外側クリックで閉じる（トリガーとパネルの両方を判定） =====
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open, closePanel]);

  const handleInstructionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME変換確定のEnterで再生成しない
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void runGenerate(instruction);
    }
  };

  // 反映直後（メイトがまだ触っていない）ときだけ「元に戻す」を出す。
  // 続きを打ち始めたら消えるので、古い取り消しが残らない。
  const canUndo = undoState !== null && composerBody === undoState.applied;

  const panelBody = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="AI下書き候補"
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-[70] flex max-h-[85vh] flex-col rounded-t-2xl border-t border-stone-200 bg-white shadow-soft-lg"
          : "fixed z-[70] flex flex-col rounded-2xl border border-stone-200 bg-white shadow-soft-lg"
      }
      style={
        isMobile
          ? undefined
          : {
              left: anchor?.left ?? PANEL_MARGIN,
              bottom: anchor?.bottom ?? PANEL_MARGIN,
              width: `min(${PANEL_WIDTH}px, calc(100vw - ${PANEL_MARGIN * 2}px))`,
              maxHeight: anchor ? `min(70vh, ${anchor.maxHeight}px)` : "70vh",
            }
      }
    >
      {/* ヘッダー */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-800">AI下書き候補</p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {fromPregenerated && drafts ? (
              <span className="whitespace-nowrap">受信時に準備済み</span>
            ) : (
              <span className="whitespace-nowrap">この人の会話をもとに作成</span>
            )}
            <span className="ml-2 hidden whitespace-nowrap sm:inline">
              1･2･3で選ぶ / rで再生成 / Escで閉じる
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="閉じる"
          className="-mr-1 shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 候補 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-4">
        {loading &&
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-stone-200 bg-stone-50 p-3"
            >
              <div className="h-4 w-12 rounded bg-stone-200" />
              <div className="mt-2.5 h-3 w-full rounded bg-stone-200" />
              <div className="mt-1.5 h-3 w-4/5 rounded bg-stone-200" />
              <div className="mt-3 h-9 w-full rounded-lg bg-stone-200" />
            </div>
          ))}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-bold">下書きを作成できませんでした</p>
            <p className="mt-1 text-[13px] leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={() => void runGenerate(instruction)}
              className="mt-2.5 inline-flex min-h-[2.75rem] items-center justify-center whitespace-nowrap rounded-lg border border-red-300 bg-white px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
            >
              もう一度作成する
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          drafts?.map((draft, index) => {
            const style = DRAFT_TYPE_STYLES[draft.type];
            return (
              <div key={draft.id} className={`rounded-xl border ${style.card}`}>
                <div className="flex items-center gap-2 px-3 pt-3">
                  <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border border-stone-300 bg-white text-[11px] font-bold tabular-nums text-stone-500">
                    {index + 1}
                  </kbd>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${style.badge}`}
                  >
                    {DRAFT_TYPE_LABELS[draft.type]}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-normal px-3 py-2.5 text-sm leading-relaxed text-stone-800">
                  {draft.body}
                </p>
                <div className="flex items-center gap-2 px-3 pb-3">
                  {composerIsEmpty ? (
                    <button
                      type="button"
                      onClick={() => applyDraft(draft, "replace")}
                      className={`inline-flex min-h-[2.75rem] flex-1 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-bold shadow-sm transition-colors ${style.primary}`}
                    >
                      これを使う
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => applyDraft(draft, "replace")}
                        className={`inline-flex min-h-[2.75rem] flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-bold shadow-sm transition-colors ${style.primary}`}
                      >
                        置き換える
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDraft(draft, "append")}
                        className={`inline-flex min-h-[2.75rem] flex-1 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-sm font-bold transition-colors ${style.outline}`}
                      >
                        末尾に追加
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

        {!loading && !error && drafts && drafts.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
            <p>下書きを作成できませんでした。</p>
            <button
              type="button"
              onClick={() => void runGenerate(instruction)}
              className="mt-2.5 inline-flex min-h-[2.75rem] items-center justify-center whitespace-nowrap rounded-lg border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 transition-colors hover:bg-stone-100"
            >
              もう一度作成する
            </button>
          </div>
        )}
      </div>

      {/* 指示して再生成 */}
      <div className="shrink-0 border-t border-stone-100 bg-stone-50/60 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleInstructionKeyDown}
            maxLength={200}
            aria-label="AIへの指示"
            placeholder="指示（例: 明日の予定を聞いて）"
            className="min-h-[2.75rem] min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm transition-all focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          <button
            type="button"
            onClick={() => void runGenerate(instruction)}
            disabled={loading}
            className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 shadow-sm transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "作成中…" : "再生成"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">
          指示を入れて再生成すると、準備済みの下書きではなく新しく作り直します。
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-1.5">
      <ToastContainer />

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-[2.75rem] items-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 shadow-sm transition-all hover:bg-stone-50"
      >
        <span className="text-lg leading-none" aria-hidden>
          ✨
        </span>
        AI下書き
        {pregenerated && pregenerated.length > 0 && (
          <>
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            />
            <span className="hidden whitespace-nowrap text-[11px] font-medium text-emerald-600 sm:inline">
              準備できています
            </span>
            <span className="sr-only">下書きの準備ができています</span>
          </>
        )}
      </button>

      {canUndo && undoState && (
        <button
          type="button"
          onClick={() => restore(undoState.previous)}
          className="inline-flex min-h-[2.75rem] items-center whitespace-nowrap rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-500 shadow-sm transition-colors hover:bg-stone-50"
        >
          元に戻す
        </button>
      )}

      {/* パネルは composer の overflow-hidden な祖先に切り取られるため body 直下へ portal する */}
      {open &&
        createPortal(
          <>
            {isMobile && (
              <div
                className="fixed inset-0 z-[65] bg-stone-900/30 backdrop-blur-sm"
                onClick={closePanel}
              />
            )}
            {panelBody}
          </>,
          document.body
        )}
    </div>
  );
}
