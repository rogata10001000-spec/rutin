"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FUNNEL_COPY_DEFS,
  FUNNEL_COPY_VAR_LABELS,
  getFunnelCopyDef,
  missingRequiredVars,
  renderFunnelCopy,
  type FunnelCopyDef,
} from "@/lib/funnel-copy-defs";
import {
  getFunnelCopyForEditor,
  saveFunnelCopyDrafts,
  publishFunnelCopy,
  resetFunnelCopyKey,
  type FunnelCopyEditorEntry,
} from "@/actions/admin/funnel-copy";
import { sendFunnelLineTestMessages } from "@/actions/admin/funnel-copy-test-send";
import { Select } from "@/components/common/Select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

// =====================================================
// 定数・純関数
// =====================================================

type ScreenId = "cast" | "detail" | "plan" | "complete" | "line";

const SCREEN_TABS: { id: ScreenId; label: string }[] = [
  { id: "cast", label: "メイト選択" },
  { id: "detail", label: "メイト詳細" },
  { id: "plan", label: "プラン選択" },
  { id: "complete", label: "完了画面" },
  { id: "line", label: "LINEメッセージ" },
];

type DeviceId = "sp" | "tb" | "pc";

const DEVICE_OPTIONS: { id: DeviceId; label: string; width: number | null }[] = [
  { id: "sp", label: "スマホ", width: 375 },
  { id: "tb", label: "タブレット", width: 768 },
  { id: "pc", label: "PC", width: null },
];

const PLAN_SELECT_OPTIONS = [
  { value: "light", label: "ライト" },
  { value: "standard", label: "スタンダード" },
  { value: "premium", label: "プレミアム" },
];

// LINEモックのサンプル差し込み値（実送信は「テスト送信」で本物の値が入る）
const SAMPLE_DAYS = 7;
const SAMPLE_SUBSCRIBE_URL = "https://liff.line.me/xxxx-xxxxxxxx";

/** 画面ごとの文言定義（定義順を保つ） */
const DEFS_BY_SCREEN: Record<ScreenId, FunnelCopyDef[]> = {
  cast: FUNNEL_COPY_DEFS.filter((d) => d.screen === "cast"),
  detail: FUNNEL_COPY_DEFS.filter((d) => d.screen === "detail"),
  plan: FUNNEL_COPY_DEFS.filter((d) => d.screen === "plan"),
  complete: FUNNEL_COPY_DEFS.filter((d) => d.screen === "complete"),
  line: FUNNEL_COPY_DEFS.filter((d) => d.screen === "line"),
};

/** グループ見出しごとに定義順のまままとめる */
function groupDefs(defs: FunnelCopyDef[]): { group: string; defs: FunnelCopyDef[] }[] {
  const groups: { group: string; defs: FunnelCopyDef[] }[] = [];
  for (const def of defs) {
    const last = groups[groups.length - 1];
    if (last && last.group === def.group) {
      last.defs.push(def);
    } else {
      groups.push({ group: def.group, defs: [def] });
    }
  }
  return groups;
}

type EntryState = { draftValue: string | null; publishedValue: string | null };

function toEntryMap(entries: FunnelCopyEditorEntry[]): Record<string, EntryState> {
  return Object.fromEntries(
    entries.map((e) => [e.key, { draftValue: e.draftValue, publishedValue: e.publishedValue }])
  );
}

/** 編集画面に最初に表示する値 = draft ?? published ?? デフォルト */
function buildLoadedValues(entries: FunnelCopyEditorEntry[]): Record<string, string> {
  const entryMap = toEntryMap(entries);
  const values: Record<string, string> = {};
  for (const def of FUNNEL_COPY_DEFS) {
    const entry = entryMap[def.key];
    values[def.key] = entry?.draftValue ?? entry?.publishedValue ?? def.defaultValue;
  }
  return values;
}

/** フィールドの入力エラー（原因＋対処）。無ければ null。 */
function fieldError(def: FunnelCopyDef, value: string): string | null {
  const missing = missingRequiredVars(def, value);
  if (missing.length > 0) {
    return `${missing.map((v) => `{${v}}`).join("・")} を含める必要があります（自動で値が入る部分です）`;
  }
  if (def.fieldType === "number" && !Number.isFinite(Number(value.trim()))) {
    return "数値で入力してください";
  }
  if (value.length > 2000) {
    return "2000文字以内で入力してください";
  }
  return null;
}

// =====================================================
// 本体
// =====================================================

type CastOption = { id: string; displayName: string };

type FunnelPreviewEditorProps = {
  initialEntries: FunnelCopyEditorEntry[];
  casts: CastOption[];
};

export function FunnelPreviewEditor({ initialEntries, casts }: FunnelPreviewEditorProps) {
  const { showToast, ToastContainer } = useToast();

  // ---- 文言の状態 ----
  const [entries, setEntries] = useState<Record<string, EntryState>>(() =>
    toEntryMap(initialEntries)
  );
  const [snapshot, setSnapshot] = useState<Record<string, string>>(() =>
    buildLoadedValues(initialEntries)
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    buildLoadedValues(initialEntries)
  );

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resettingKey, setResettingKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // ---- プレビューの状態 ----
  const [activeScreen, setActiveScreen] = useState<ScreenId>("cast");
  const [device, setDevice] = useState<DeviceId>("sp");
  const [selectedCastId, setSelectedCastId] = useState<string>(casts[0]?.id ?? "");
  const [iframeKey, setIframeKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameError, setFrameError] = useState(false);

  // ---- dirty tracking ----
  const dirtyKeys = useMemo(
    () =>
      FUNNEL_COPY_DEFS.filter((d) => (values[d.key] ?? "") !== (snapshot[d.key] ?? "")).map(
        (d) => d.key
      ),
    [values, snapshot]
  );
  const isDirty = dirtyKeys.length > 0;

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const def of FUNNEL_COPY_DEFS) {
      const err = fieldError(def, values[def.key] ?? "");
      if (err) map[def.key] = err;
    }
    return map;
  }, [values]);

  const hasBlockingError = useMemo(
    () => dirtyKeys.some((k) => errors[k]),
    [dirtyKeys, errors]
  );

  // 保存済みの下書き数（公開ボタンのバッジ）
  const savedDraftCount = useMemo(
    () => Object.values(entries).filter((e) => e.draftValue != null).length,
    [entries]
  );

  // 「保存→公開」まで進めた場合に公開対象となる件数（未保存の編集も含めて算出）
  const publishTargetCount = useMemo(() => {
    let count = 0;
    for (const def of FUNNEL_COPY_DEFS) {
      const value = values[def.key] ?? "";
      const dirty = value !== (snapshot[def.key] ?? "");
      const nextDraft = dirty
        ? value === def.defaultValue
          ? null
          : value
        : entries[def.key]?.draftValue ?? null;
      if (nextDraft != null) count += 1;
    }
    return count;
  }, [values, snapshot, entries]);

  // ---- 離脱ガード（未保存の変更があるときだけ）----
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ---- iframe ----
  const needsCast = activeScreen === "detail" || activeScreen === "plan";
  const frameSrc = useMemo(() => {
    switch (activeScreen) {
      case "cast":
        return "/subscribe/cast?preview=1";
      case "detail":
        return selectedCastId
          ? `/subscribe/cast?preview=1&cast=${encodeURIComponent(selectedCastId)}`
          : null;
      case "plan":
        return selectedCastId
          ? `/subscribe/plan?castId=${encodeURIComponent(selectedCastId)}&preview=1`
          : null;
      case "complete":
        return "/subscribe/complete?preview=1";
      case "line":
        return null;
    }
  }, [activeScreen, selectedCastId]);

  // src / 再読み込みのたびにローディング状態をリセット
  useEffect(() => {
    if (!frameSrc) return;
    setFrameLoading(true);
    setFrameError(false);
  }, [frameSrc, iframeKey]);

  // ウォッチドッグ: 一定時間ロード完了しなければエラー表示に切り替える（無限スケルトン防止）
  useEffect(() => {
    if (!frameLoading || !frameSrc) return;
    const timer = setTimeout(() => {
      setFrameLoading(false);
      setFrameError(true);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [frameLoading, frameSrc, iframeKey]);

  const reloadFrame = useCallback(() => setIframeKey((k) => k + 1), []);

  // ---- 下書き保存 ----
  const handleSave = useCallback(
    async (options: { silent?: boolean } = {}): Promise<boolean> => {
      if (dirtyKeys.length === 0) return true;
      if (dirtyKeys.some((k) => errors[k])) {
        showToast("入力エラーがあります。赤く表示された項目を修正してください", "error");
        return false;
      }

      setSaving(true);
      const drafts = Object.fromEntries(dirtyKeys.map((k) => [k, values[k] ?? ""]));
      const result = await saveFunnelCopyDrafts({ drafts });
      setSaving(false);

      if (!result.ok) {
        // 入力は保持したままエラーを伝える
        showToast(result.error.message, "error");
        return false;
      }

      setSnapshot((prev) => ({ ...prev, ...drafts }));
      setEntries((prev) => {
        const next = { ...prev };
        for (const key of dirtyKeys) {
          const def = getFunnelCopyDef(key);
          if (!def) continue;
          const value = drafts[key];
          // サーバーと同じ正規化: デフォルトと同値の下書きは「下書きなし」
          const draftValue = value === def.defaultValue ? null : value;
          next[key] = { ...(next[key] ?? { publishedValue: null }), draftValue };
        }
        return next;
      });

      if (!options.silent) {
        showToast("下書きを保存しました。プレビューに反映されています", "success");
      }
      // 保存した下書きをすぐプレビューへ反映
      setIframeKey((k) => k + 1);
      return true;
    },
    [dirtyKeys, errors, values, showToast]
  );

  // ---- 破棄 ----
  const handleDiscard = useCallback(() => {
    setValues(snapshot);
  }, [snapshot]);

  // ---- 公開 ----
  const handlePublishConfirm = useCallback(async () => {
    setPublishing(true);

    if (isDirty) {
      const saved = await handleSave({ silent: true });
      if (!saved) {
        setPublishing(false);
        setConfirmOpen(false);
        return;
      }
    }

    const result = await publishFunnelCopy();
    if (!result.ok) {
      setPublishing(false);
      setConfirmOpen(false);
      showToast(result.error.message, "error");
      return;
    }

    // サーバーの最新状態で丸ごと更新（draft→published への移動をローカル計算しない）
    const refreshed = await getFunnelCopyForEditor();
    if (refreshed.ok) {
      setEntries(toEntryMap(refreshed.data.entries));
      const loaded = buildLoadedValues(refreshed.data.entries);
      setSnapshot(loaded);
      setValues(loaded);
    }

    setPublishing(false);
    setConfirmOpen(false);
    showToast(`${result.data.publishedCount}件の文言を公開しました`, "success");
    setIframeKey((k) => k + 1);
  }, [isDirty, handleSave, showToast]);

  // ---- 初期値に戻す ----
  const handleReset = useCallback(
    async (def: FunnelCopyDef) => {
      setResettingKey(def.key);
      const result = await resetFunnelCopyKey(def.key);
      setResettingKey(null);

      if (!result.ok) {
        showToast(result.error.message, "error");
        return;
      }

      setEntries((prev) => ({
        ...prev,
        [def.key]: { draftValue: null, publishedValue: null },
      }));
      setSnapshot((prev) => ({ ...prev, [def.key]: def.defaultValue }));
      setValues((prev) => ({ ...prev, [def.key]: def.defaultValue }));
      showToast(`「${def.label}」を初期値に戻しました`, "success");
      setIframeKey((k) => k + 1);
    },
    [showToast]
  );

  // ---- LINEテスト送信 ----
  const handleTestSend = useCallback(async () => {
    setTesting(true);
    const result = await sendFunnelLineTestMessages();
    setTesting(false);
    if (result.ok) {
      showToast(`${result.data.sent}件のLINEへテスト送信しました`, "success");
    } else {
      showToast(result.error.message, "error");
    }
  }, [showToast]);

  // ---- 描画 ----
  const activeDefs = DEFS_BY_SCREEN[activeScreen];
  const activeGroups = useMemo(() => groupDefs(activeDefs), [activeDefs]);
  const deviceWidth = DEVICE_OPTIONS.find((d) => d.id === device)?.width ?? null;

  const castSelectOptions = useMemo(
    () => casts.map((c) => ({ value: c.id, label: c.displayName })),
    [casts]
  );

  const confirmDescription = useMemo(() => {
    const base = `公開すると、いま申込画面を開いているユーザーにも次の表示から反映されます。対象: ${publishTargetCount}件`;
    return isDirty ? `未保存の変更を下書き保存してから公開します。${base}` : base;
  }, [isDirty, publishTargetCount]);

  return (
    <div className="pb-4">
      <ToastContainer />

      {/* 画面タブ + 公開ボタン */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="プレビューする画面"
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1"
        >
          {SCREEN_TABS.map((tab) => {
            const selected = tab.id === activeScreen;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveScreen(tab.id)}
                className={`min-h-[2.5rem] whitespace-nowrap rounded-lg px-3.5 text-sm font-bold transition-colors ${
                  selected
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={publishTargetCount === 0 || publishing || saving}
          className="inline-flex min-h-[2.75rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          公開する
          {publishTargetCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-bold">
              {publishTargetCount}
            </span>
          )}
        </button>
      </div>

      {/* 2ペイン: モバイルはプレビュー上・編集下 / lg以上は編集左・プレビュー右 */}
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ===== 編集パネル ===== */}
        <section
          aria-label="文言の編集"
          className="order-2 min-w-0 space-y-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-soft sm:p-5 lg:order-1"
        >
          {activeGroups.map(({ group, defs }) => (
            <div key={group}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">
                {group}
              </h3>
              <div className="mt-2 space-y-4">
                {defs.map((def) => (
                  <CopyField
                    key={def.key}
                    def={def}
                    value={values[def.key] ?? ""}
                    entry={entries[def.key] ?? { draftValue: null, publishedValue: null }}
                    error={errors[def.key] ?? null}
                    resetting={resettingKey === def.key}
                    onChange={(v) => setValues((prev) => ({ ...prev, [def.key]: v }))}
                    onReset={() => void handleReset(def)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ===== プレビュー ===== */}
        <section aria-label="プレビュー" className="order-1 min-w-0 lg:order-2">
          {activeScreen === "line" ? (
            <LineChatMock
              values={values}
              testing={testing}
              onTestSend={() => void handleTestSend()}
            />
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft sm:p-5">
              {/* ツールバー */}
              <div className="flex flex-wrap items-center gap-3">
                <div
                  role="radiogroup"
                  aria-label="プレビューの画面幅"
                  className="flex gap-1 rounded-lg bg-stone-100 p-1"
                >
                  {DEVICE_OPTIONS.map((opt) => {
                    const selected = opt.id === device;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDevice(opt.id)}
                        className={`min-h-[2.25rem] whitespace-nowrap rounded-md px-3 text-xs font-bold transition-colors ${
                          selected
                            ? "bg-white text-stone-900 shadow-sm"
                            : "text-stone-500 hover:text-stone-800"
                        }`}
                      >
                        {opt.label}
                        {opt.width != null && (
                          <span className="ml-1 font-normal text-stone-400">{opt.width}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {needsCast && (
                  <div className="w-52 max-w-full">
                    <Select
                      size="sm"
                      value={selectedCastId}
                      onChange={setSelectedCastId}
                      options={castSelectOptions}
                      placeholder="メイトを選択"
                      aria-label="プレビューするメイト"
                    />
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={reloadFrame}
                    className="inline-flex min-h-[2.25rem] items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    再読み込み
                  </button>
                  {frameSrc && (
                    <a
                      href={frameSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[2.25rem] items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      新しいタブで開く
                    </a>
                  )}
                </div>
              </div>

              {/* iframe（端末フレーム） */}
              <div className="mt-4 overflow-x-auto">
                {frameSrc == null ? (
                  <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 px-6 text-center text-sm text-stone-500">
                    受付中の伴走メイトがいないため、この画面をプレビューできません。「メイト管理」で受付中のメイトを設定してください。
                  </div>
                ) : (
                  <div
                    className="relative mx-auto h-[70vh] min-h-[480px] overflow-hidden rounded-xl border border-stone-300 bg-white shadow-soft"
                    style={{
                      width: deviceWidth != null ? `${deviceWidth}px` : "100%",
                      maxWidth: "100%",
                    }}
                  >
                    <iframe
                      key={iframeKey}
                      src={frameSrc}
                      title={`申込画面プレビュー: ${SCREEN_TABS.find((t) => t.id === activeScreen)?.label ?? ""}`}
                      className="h-full w-full border-0"
                      onLoad={() => {
                        setFrameLoading(false);
                        setFrameError(false);
                      }}
                    />

                    {/* ローディングオーバーレイ */}
                    {frameLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                        <div className="w-3/4 space-y-3">
                          <div className="h-6 animate-pulse rounded-lg bg-stone-100" />
                          <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
                          <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
                        </div>
                        <p className="text-sm text-stone-400">プレビューを読み込んでいます…</p>
                      </div>
                    )}

                    {/* エラーフォールバック */}
                    {frameError && !frameLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
                        <p className="text-sm text-stone-600">
                          プレビューを表示できませんでした。再読み込みしてください。
                        </p>
                        <button
                          type="button"
                          onClick={reloadFrame}
                          className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
                        >
                          再読み込み
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ===== 保存バー（未保存のときだけ・スクロール位置に依存しない） ===== */}
      {isDirty && (
        <div className="sticky bottom-0 z-40 -mx-4 mt-6 border-t border-amber-200 bg-amber-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              未保存の変更があります（{dirtyKeys.length}件）
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="min-h-[2.75rem] whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-50"
              >
                変更を破棄
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || hasBlockingError}
                className="min-h-[2.75rem] whitespace-nowrap rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "保存中…" : "下書き保存"}
              </button>
            </div>
          </div>
          {hasBlockingError && (
            <p className="mt-1 text-xs text-red-600">
              入力エラーのある項目を修正すると保存できます
            </p>
          )}
        </div>
      )}

      {/* 公開の確認 */}
      <ConfirmDialog
        open={confirmOpen}
        title="文言を公開しますか？"
        description={confirmDescription}
        confirmLabel="公開する"
        loading={publishing}
        onConfirm={() => void handlePublishConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// =====================================================
// 編集フィールド
// =====================================================

function CopyField({
  def,
  value,
  entry,
  error,
  resetting,
  onChange,
  onReset,
}: {
  def: FunnelCopyDef;
  value: string;
  entry: EntryState;
  error: string | null;
  resetting: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const inputId = `funnel-copy-${def.key.replace(/\./g, "-")}`;
  const hasRow = entry.draftValue != null || entry.publishedValue != null;

  // ステータス: 公開中（published ?? デフォルト）と異なる内容か
  const publishedOrDefault = entry.publishedValue ?? def.defaultValue;
  const differsFromPublished = value !== publishedOrDefault;

  const inputBaseClass =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-800 shadow-sm focus:outline-none focus:ring-1 " +
    (error
      ? "border-red-300 focus:border-red-400 focus:ring-red-300"
      : "border-stone-200 focus:border-terracotta focus:ring-terracotta");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-stone-700">
          {def.label}
          {differsFromPublished && (
            <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              公開中と異なる下書き
            </span>
          )}
          {!differsFromPublished && !hasRow && (
            <span className="ml-2 whitespace-nowrap text-[11px] text-stone-400">初期値</span>
          )}
        </label>
        {(hasRow || value !== def.defaultValue) && (
          <button
            type="button"
            onClick={onReset}
            disabled={resetting}
            className="shrink-0 whitespace-nowrap text-[11px] font-medium text-stone-400 underline-offset-2 transition-colors hover:text-stone-600 hover:underline disabled:opacity-50"
          >
            {resetting ? "戻しています…" : "初期値に戻す"}
          </button>
        )}
      </div>

      <div className="mt-1">
        {def.fieldType === "multiline" ? (
          <textarea
            id={inputId}
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputBaseClass} resize-y leading-relaxed`}
          />
        ) : def.fieldType === "number" ? (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputBaseClass} max-w-[6rem] text-right`}
            />
            <span className="text-sm text-stone-500">人</span>
          </div>
        ) : def.fieldType === "plan-select" ? (
          <Select
            id={inputId}
            size="sm"
            value={value}
            onChange={onChange}
            options={PLAN_SELECT_OPTIONS}
            aria-label={def.label}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputBaseClass}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}

      {def.fieldType === "multiline" && (
        <p className="mt-1 text-right text-[11px] text-stone-400">{value.length}文字</p>
      )}

      {def.vars && def.vars.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {def.vars.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600"
            >
              <code className="font-mono font-bold">{`{${name}}`}</code>
              <span className="whitespace-nowrap">
                {FUNNEL_COPY_VAR_LABELS[name] ?? "自動で値が入ります"}
              </span>
            </span>
          ))}
        </div>
      )}

      {def.hint && <p className="mt-1 text-xs text-stone-500">{def.hint}</p>}
    </div>
  );
}

// =====================================================
// LINE風トークモック
// =====================================================

/** {subscribeUrl} をリンク風表示に置き換えつつ本文を描画する */
function WelcomeBody({ template }: { template: string }) {
  const rendered = renderFunnelCopy(template, { days: SAMPLE_DAYS });
  const parts = rendered.split("{subscribeUrl}");
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="break-all text-blue-600 underline">{SAMPLE_SUBSCRIBE_URL}</span>
          )}
        </span>
      ))}
    </p>
  );
}

function LineChatMock({
  values,
  testing,
  onTestSend,
}: {
  values: Record<string, string>;
  testing: boolean;
  onTestSend: () => void;
}) {
  const vars = { days: SAMPLE_DAYS };
  const altText = renderFunnelCopy(values["line.flex.alttext"] ?? "", vars);
  const flexTitle = renderFunnelCopy(values["line.flex.title"] ?? "", vars);
  const flexBody = renderFunnelCopy(values["line.flex.body"] ?? "", vars);
  const flexExpiry = renderFunnelCopy(values["line.flex.expiry"] ?? "", vars);
  const flexButton = renderFunnelCopy(values["line.flex.button"] ?? "", vars);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-stone-800">LINEトーク画面のイメージ</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            編集中の内容がそのまま反映されます（日数は例として{SAMPLE_DAYS}日で表示）
          </p>
        </div>
        <button
          type="button"
          onClick={onTestSend}
          disabled={testing}
          className="inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? "送信中…" : "テスト送信"}
        </button>
      </div>
      <p className="mt-1 text-xs text-stone-400">
        「テスト送信」で、下書き保存済みの文言を運営の通知先LINE（通知設定と同じ宛先）へ実際に送って実機確認できます。
      </p>

      {/* トーク画面 */}
      <div className="mt-4 space-y-4 rounded-xl bg-stone-100 p-4">
        {/* 友だち追加時の挨拶 */}
        <div className="flex items-start gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-bold text-white"
            aria-hidden="true"
          >
            R
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-stone-500">Rutin</p>
            <div className="mt-0.5 max-w-md rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm">
              <WelcomeBody template={values["line.welcome.body"] ?? ""} />
            </div>
          </div>
        </div>

        {/* 申込案内Flexカード */}
        <div className="flex items-start gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-bold text-white"
            aria-hidden="true"
          >
            R
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-stone-500">Rutin</p>
            <p className="mt-0.5 max-w-md truncate text-[11px] text-stone-400" title={altText}>
              通知プレビュー: {altText}
            </p>
            <div className="mt-1 w-64 max-w-full overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="space-y-2 px-4 pt-4">
                <p className="break-words text-base font-bold text-[#2D241E]">{flexTitle}</p>
                <p className="break-words text-sm leading-relaxed text-[#6B5A51]">{flexBody}</p>
                <p className="break-words text-xs text-[#8A786D]">{flexExpiry}</p>
              </div>
              <div className="p-3">
                <div className="flex min-h-[2.75rem] items-center justify-center rounded-lg bg-[#D97757] px-3 text-center text-sm font-bold text-white">
                  <span className="truncate">{flexButton}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
