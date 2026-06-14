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

  return (
    <div className="space-y-4">
      {/* 検索ボックス */}
      <div className="relative">
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
          className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-9 text-sm text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
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
      {/* サマリー表示 */}
      {summary && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-stone-100 px-3 py-1.5 font-medium text-stone-700">
              全 {summary.total}人
            </span>
            <span className="rounded-lg bg-red-100 px-3 py-1.5 font-medium text-red-700">
              未返信 {summary.unreplied}人
            </span>
            <span className="rounded-lg bg-amber-100 px-3 py-1.5 font-medium text-amber-700">
              今日未送信 {summary.notSentToday}人
            </span>
            <span className="rounded-lg bg-green-100 px-3 py-1.5 font-medium text-green-700">
              対応済み {summary.replied}人
            </span>
          </div>

          {/* 対応率プログレスバー */}
          {summary.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>今日の対応率</span>
                <span className="font-bold text-stone-700">
                  {summary.replied}/{summary.total}人
                  ({Math.round((summary.replied / summary.total) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    summary.replied / summary.total >= 0.8
                      ? "bg-green-500"
                      : summary.replied / summary.total >= 0.5
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.round((summary.replied / summary.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 未対応警告バナー */}
          {summary.notSentToday > 0 && (
            <button
              onClick={() => updateMultipleFilters([
                { key: "todaySentZero", value: "true" },
                { key: "sort", value: "today_sent_asc" },
              ])}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
            >
              {summary.notSentToday}人のユーザーに今日まだ対応していません。クリックで絞り込み
            </button>
          )}
        </div>
      )}

      {/* フィルタコントロール */}
      <div className="overflow-x-auto pb-0.5 no-scrollbar">
      <div className="flex min-w-max flex-wrap items-center gap-2">
        {/* 返信状態フィルタ（新規） */}
        <Select
          aria-label="返信状態で絞り込み"
          className="w-auto min-w-[10rem]"
          value={currentFilters.replyStatus ?? "all"}
          onChange={(value) => updateFilter("reply", value === "all" ? null : value)}
          options={[
            { value: "all", label: "全ての返信状態" },
            { value: "unreplied", label: "未返信のみ" },
            { value: "not_sent_today", label: "今日未送信のみ" },
          ]}
        />

        {/* プランフィルタ */}
        <Select
          aria-label="プランで絞り込み"
          className="w-auto min-w-[8rem]"
          value={currentFilters.planCodes?.join(",") ?? ""}
          onChange={(value) => updateFilter("plan", value || null)}
          options={[
            { value: "", label: "全プラン" },
            { value: "premium", label: "Premium" },
            { value: "standard", label: "Standard" },
            { value: "light", label: "Light" },
          ]}
        />

        {/* 担当メイトフィルタ（新規） */}
        <Select
          aria-label="担当メイトで絞り込み"
          className="w-auto min-w-[8rem]"
          value={
            currentFilters.hasUnassigned
              ? "unassigned"
              : currentFilters.assignedCastId ?? ""
          }
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

        {/* 状態フィルタ */}
        <Select
          aria-label="契約状態で絞り込み"
          className="w-auto min-w-[8rem]"
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

        {/* SLAフィルタ */}
        <Select
          aria-label="SLA状態で絞り込み"
          className="w-auto min-w-[8rem]"
          value={currentFilters.slaStatus ?? "all"}
          onChange={(value) => updateFilter("sla", value === "all" ? null : value)}
          options={[
            { value: "all", label: "全SLA" },
            { value: "breached", label: "SLA超過中" },
            { value: "warning", label: "SLA警告圏内" },
          ]}
        />

        {/* ソート */}
        <Select
          aria-label="並び順"
          className="w-auto min-w-[10rem]"
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

        {/* 危険フラグ */}
        <button
          onClick={() => toggleFilter("risk", currentFilters.hasRisk)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm ${
            currentFilters.hasRisk
              ? "bg-red-100 text-red-700 border border-red-200"
              : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
          }`}
        >
          ⚠️ リスク
        </button>

        {/* 未報告フィルタ */}
        <button
          onClick={() => toggleFilter("unreported", currentFilters.isUnreported)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm ${
            currentFilters.isUnreported
              ? "bg-orange-100 text-orange-700 border border-orange-200"
              : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
          }`}
        >
          📋 未報告
        </button>

        {/* 休止除外 */}
        <button
          onClick={() => toggleFilter("excludePaused", currentFilters.excludePaused)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm ${
            currentFilters.excludePaused
              ? "bg-stone-700 text-white border border-stone-700"
              : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
          }`}
        >
          休止除外
        </button>

        {/* 今日0回対応 */}
        <button
          onClick={() => toggleFilter("todaySentZero", currentFilters.todaySentZero)}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm ${
            currentFilters.todaySentZero
              ? "bg-amber-100 text-amber-700 border border-amber-200"
              : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
          }`}
        >
          今日0回
        </button>

        {/* フィルタクリア（選択中ユーザーは維持） */}
        {hasActiveFilters && (
          <button
            onClick={() =>
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
              )
            }
            className="flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors px-2"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            クリア
          </button>
        )}
      </div>
      </div>

      {/* タグ絞り込み */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
    </div>
  );
}
