"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InboxSummary } from "@/actions/inbox";
import { Select } from "@/components/common/Select";

type Cast = {
  id: string;
  displayName: string;
};

type InboxFiltersProps = {
  currentFilters: {
    planCodes?: string[];
    statuses?: string[];
    hasRisk?: boolean;
    isUnreported?: boolean;
    replyStatus?: "unreplied" | "not_sent_today" | "all";
    assignedCastId?: string;
    hasUnassigned?: boolean;
    slaStatus?: "breached" | "warning" | "all";
    excludePaused?: boolean;
    todaySentZero?: boolean;
    query?: string;
    tags?: string[];
    sortBy?: "priority" | "last_message" | "nickname" | "unreplied_duration" | "today_sent_asc" | "last_reply_oldest";
  };
  casts?: Cast[];
  summary?: InboxSummary;
  availableTags?: string[];
};

export function InboxFilters({ currentFilters, casts = [], summary, availableTags = [] }: InboxFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 検索ボックスはローカル state + デバウンスでURLに反映
  const [searchInput, setSearchInput] = useState(currentFilters.query ?? "");

  // 詳細フィルタの開閉（既定は閉じてリストを上部に表示）。状態は localStorage に保持。
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
    setShowAdvanced(localStorage.getItem("inboxFiltersOpen") === "true");
  }, []);
  const toggleAdvanced = useCallback(() => {
    setShowAdvanced((prev) => {
      const next = !prev;
      localStorage.setItem("inboxFiltersOpen", String(next));
      return next;
    });
  }, []);

  // 選択中ユーザー(user)を維持したままURLを構築
  const buildUrl = useCallback(
    (updates: Array<{ key: string; value: string | null }>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const { key, value } of updates) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      return qs ? `/inbox?${qs}` : "/inbox";
    },
    [searchParams]
  );

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      router.push(buildUrl([{ key, value }]));
    },
    [router, buildUrl]
  );

  // 複数のフィルタを同時に更新するためのヘルパー
  const updateMultipleFilters = useCallback(
    (updates: Array<{ key: string; value: string | null }>) => {
      router.push(buildUrl(updates));
    },
    [router, buildUrl]
  );

  const toggleFilter = useCallback(
    (key: string, current: boolean | undefined) => {
      updateFilter(key, current ? null : "true");
    },
    [updateFilter]
  );

  // 検索デバウンス（外部からのquery変更にも追従）
  useEffect(() => {
    setSearchInput(currentFilters.query ?? "");
  }, [currentFilters.query]);

  useEffect(() => {
    const current = currentFilters.query ?? "";
    if (searchInput === current) return;
    const timer = setTimeout(() => {
      updateFilter("q", searchInput.trim() || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, currentFilters.query, updateFilter]);

  const selectedTags = useMemo(() => currentFilters.tags ?? [], [currentFilters.tags]);
  const toggleTag = useCallback(
    (tag: string) => {
      const next = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      updateFilter("tags", next.length ? next.join(",") : null);
    },
    [selectedTags, updateFilter]
  );

  const hasActiveFilters =
    currentFilters.planCodes ||
    currentFilters.statuses ||
    currentFilters.hasRisk ||
    currentFilters.isUnreported ||
    currentFilters.replyStatus ||
    currentFilters.assignedCastId ||
    currentFilters.hasUnassigned ||
    currentFilters.slaStatus ||
    currentFilters.excludePaused ||
    currentFilters.todaySentZero ||
    currentFilters.query ||
    selectedTags.length > 0;

  // 「絞り込み」ボタンに表示する適用中フィルタ数（検索語は別UIなので除外）
  const activeFilterCount = [
    currentFilters.planCodes,
    currentFilters.statuses,
    currentFilters.hasRisk,
    currentFilters.isUnreported,
    currentFilters.replyStatus,
    currentFilters.assignedCastId || currentFilters.hasUnassigned,
    currentFilters.slaStatus,
    currentFilters.excludePaused,
    currentFilters.todaySentZero,
    currentFilters.sortBy && currentFilters.sortBy !== "priority",
    selectedTags.length > 0,
  ].filter(Boolean).length;

  const compliancePct =
    summary && summary.total > 0
      ? Math.round((summary.replied / summary.total) * 100)
      : 0;

  const clearAll = () =>
    router.push(
      buildUrl([
        { key: "plan", value: null },
        { key: "status", value: null },
        { key: "risk", value: null },
        { key: "unreported", value: null },
        { key: "reply", value: null },
        { key: "cast", value: null },
        { key: "unassigned", value: null },
        { key: "sort", value: null },
        { key: "sla", value: null },
        { key: "excludePaused", value: null },
        { key: "todaySentZero", value: null },
        { key: "q", value: null },
        { key: "tags", value: null },
      ])
    );

  const toggleButtonClass = (active: boolean, activeColor: string) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${
      active ? activeColor : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
    }`;

  return (
    <div className="space-y-3">
      {/* 検索 + 絞り込みトグル（常時表示・最小高さ） */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
            </svg>
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="名前で検索"
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-9 text-sm text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="検索をクリア"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleAdvanced}
          aria-expanded={showAdvanced}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold shadow-sm transition-colors ${
            showAdvanced || activeFilterCount > 0
              ? "border-terracotta bg-terracotta/10 text-terracotta"
              : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 10h12M10 16h4" />
          </svg>
          絞り込み
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-terracotta px-1 text-[11px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* サマリー（ワンタップ絞り込みチップ・横スクロール1行） */}
      {summary && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 no-scrollbar">
          <button
            type="button"
            onClick={() => updateFilter("reply", null)}
            className={`whitespace-nowrap rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-700 transition ${
              !currentFilters.replyStatus ? "ring-2 ring-stone-300" : "opacity-90 hover:opacity-100"
            }`}
          >
            全 {summary.total}
          </button>
          <button
            type="button"
            onClick={() => updateFilter("reply", "unreplied")}
            className={`whitespace-nowrap rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-700 transition ${
              currentFilters.replyStatus === "unreplied" ? "ring-2 ring-red-300" : "opacity-90 hover:opacity-100"
            }`}
          >
            未返信 {summary.unreplied}
          </button>
          <button
            type="button"
            onClick={() => updateFilter("reply", "not_sent_today")}
            className={`whitespace-nowrap rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition ${
              currentFilters.replyStatus === "not_sent_today" ? "ring-2 ring-amber-300" : "opacity-90 hover:opacity-100"
            }`}
          >
            今日未送信 {summary.notSentToday}
          </button>
          <span className="whitespace-nowrap rounded-lg bg-green-100 px-2.5 py-1.5 text-xs font-bold text-green-700">
            対応済み {summary.replied}
          </span>
        </div>
      )}

      {/* 対応率（コンパクト） */}
      {summary && summary.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>今日の対応率</span>
            <span className="font-bold text-stone-700">
              {summary.replied}/{summary.total} ({compliancePct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                compliancePct >= 80 ? "bg-green-500" : compliancePct >= 50 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${compliancePct}%` }}
            />
          </div>
        </div>
      )}

      {/* 未対応警告バナー（絞り込み＋まとめて送るの直行導線） */}
      {summary && summary.notSentToday > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <button
            onClick={() =>
              updateMultipleFilters([
                { key: "todaySentZero", value: "true" },
                { key: "sort", value: "today_sent_asc" },
              ])
            }
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium text-amber-800 transition-colors hover:text-amber-900"
          >
            <span aria-hidden>⏰</span>
            <span className="min-w-0">
              {summary.notSentToday}人に今日まだ対応していません。タップで絞り込み
            </span>
          </button>
          <button
            onClick={() =>
              updateMultipleFilters([
                { key: "todaySentZero", value: "true" },
                { key: "sort", value: "today_sent_asc" },
                { key: "bulkSelect", value: "1" },
              ])
            }
            className="shrink-0 whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            まとめて送る
          </button>
        </div>
      )}

      {/* 詳細フィルタ（折りたたみ） */}
      {showAdvanced && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label="返信状態で絞り込み"
              size="sm"
              value={currentFilters.replyStatus ?? "all"}
              onChange={(value) => updateFilter("reply", value === "all" ? null : value)}
              options={[
                { value: "all", label: "全ての返信状態" },
                { value: "unreplied", label: "未返信のみ" },
                { value: "not_sent_today", label: "今日未送信のみ" },
              ]}
            />
            <Select
              aria-label="プランで絞り込み"
              size="sm"
              value={currentFilters.planCodes?.join(",") ?? ""}
              onChange={(value) => updateFilter("plan", value || null)}
              options={[
                { value: "", label: "全プラン" },
                { value: "premium", label: "Premium" },
                { value: "standard", label: "Standard" },
                { value: "light", label: "Light" },
              ]}
            />
            <Select
              aria-label="担当メイトで絞り込み"
              size="sm"
              value={currentFilters.hasUnassigned ? "unassigned" : currentFilters.assignedCastId ?? ""}
              onChange={(value) => {
                if (value === "unassigned") {
                  updateMultipleFilters([
                    { key: "cast", value: null },
                    { key: "unassigned", value: "true" },
                  ]);
                } else if (value === "") {
                  updateMultipleFilters([
                    { key: "cast", value: null },
                    { key: "unassigned", value: null },
                  ]);
                } else {
                  updateMultipleFilters([
                    { key: "cast", value },
                    { key: "unassigned", value: null },
                  ]);
                }
              }}
              options={[
                { value: "", label: "全担当" },
                { value: "unassigned", label: "未割当" },
                ...casts.map((cast) => ({ value: cast.id, label: cast.displayName })),
              ]}
            />
            <Select
              aria-label="契約状態で絞り込み"
              size="sm"
              value={currentFilters.statuses?.join(",") ?? ""}
              onChange={(value) => updateFilter("status", value || null)}
              options={[
                { value: "", label: "全状態" },
                { value: "trial", label: "トライアル" },
                { value: "active", label: "契約中" },
                { value: "past_due", label: "支払い遅延" },
                { value: "paused", label: "一時停止" },
                { value: "canceled", label: "解約済み" },
              ]}
            />
            <Select
              aria-label="SLA状態で絞り込み"
              size="sm"
              value={currentFilters.slaStatus ?? "all"}
              onChange={(value) => updateFilter("sla", value === "all" ? null : value)}
              options={[
                { value: "all", label: "全SLA" },
                { value: "breached", label: "SLA超過中" },
                { value: "warning", label: "SLA警告圏内" },
              ]}
            />
            <Select
              aria-label="並び順"
              size="sm"
              className="col-span-2"
              value={currentFilters.sortBy ?? "priority"}
              onChange={(value) => updateFilter("sort", value === "priority" ? null : value)}
              options={[
                { value: "priority", label: "優先度順" },
                { value: "unreplied_duration", label: "未返信時間が長い順" },
                { value: "today_sent_asc", label: "今日の送信が少ない順" },
                { value: "last_reply_oldest", label: "最終対応が古い順" },
                { value: "last_message", label: "メッセージ日時順" },
                { value: "nickname", label: "名前順" },
              ]}
            />
          </div>

          {/* トグルフィルタ */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleFilter("risk", currentFilters.hasRisk)}
              className={toggleButtonClass(!!currentFilters.hasRisk, "border border-red-200 bg-red-100 text-red-700")}
            >
              ⚠️ リスク
            </button>
            <button
              onClick={() => toggleFilter("unreported", currentFilters.isUnreported)}
              className={toggleButtonClass(!!currentFilters.isUnreported, "border border-orange-200 bg-orange-100 text-orange-700")}
            >
              📋 未報告
            </button>
            <button
              onClick={() => toggleFilter("excludePaused", currentFilters.excludePaused)}
              className={toggleButtonClass(!!currentFilters.excludePaused, "border border-stone-700 bg-stone-700 text-white")}
            >
              休止除外
            </button>
            <button
              onClick={() => toggleFilter("todaySentZero", currentFilters.todaySentZero)}
              className={toggleButtonClass(!!currentFilters.todaySentZero, "border border-amber-200 bg-amber-100 text-amber-700")}
            >
              今日0回
            </button>
          </div>

          {/* タグ絞り込み */}
          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-200 pt-2.5">
              <span className="mr-1 text-xs font-medium text-stone-400">タグ:</span>
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-terracotta bg-terracotta/10 text-terracotta"
                        : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          {/* すべてクリア */}
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 border-t border-stone-200 pt-2.5 text-xs font-medium text-stone-500 transition-colors hover:text-stone-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              すべてクリア
            </button>
          )}
        </div>
      )}
    </div>
  );
}
