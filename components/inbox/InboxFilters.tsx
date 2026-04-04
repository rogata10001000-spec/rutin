"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { InboxSummary } from "@/actions/inbox";

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
    sortBy?: "priority" | "last_message" | "nickname" | "unreplied_duration" | "today_sent_asc" | "last_reply_oldest";
  };
  casts?: Cast[];
  summary?: InboxSummary;
};

export function InboxFilters({ currentFilters, casts = [], summary }: InboxFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/inbox?${params.toString()}`);
    },
    [router, searchParams]
  );

  // 複数のフィルタを同時に更新するためのヘルパー
  const updateMultipleFilters = useCallback(
    (updates: Array<{ key: string; value: string | null }>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const { key, value } of updates) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/inbox?${params.toString()}`);
    },
    [router, searchParams]
  );

  const toggleFilter = useCallback(
    (key: string, current: boolean | undefined) => {
      updateFilter(key, current ? null : "true");
    },
    [updateFilter]
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
    currentFilters.todaySentZero;

  return (
    <div className="space-y-4">
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
      <div className="flex flex-wrap items-center gap-3">
        {/* 返信状態フィルタ（新規） */}
        <div className="relative">
          <select
            value={currentFilters.replyStatus ?? "all"}
            onChange={(e) => updateFilter("reply", e.target.value === "all" ? null : e.target.value)}
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="all">全ての返信状態</option>
            <option value="unreplied">未返信のみ</option>
            <option value="not_sent_today">今日未送信のみ</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* プランフィルタ */}
        <div className="relative">
          <select
            value={currentFilters.planCodes?.join(",") ?? ""}
            onChange={(e) => updateFilter("plan", e.target.value || null)}
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="">全プラン</option>
            <option value="premium">Premium</option>
            <option value="standard">Standard</option>
            <option value="light">Light</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* 担当キャストフィルタ（新規） */}
        <div className="relative">
          <select
            value={
              currentFilters.hasUnassigned
                ? "unassigned"
                : currentFilters.assignedCastId ?? ""
            }
            onChange={(e) => {
              const value = e.target.value;
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
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="">全担当</option>
            <option value="unassigned">未割当</option>
            {casts.map((cast) => (
              <option key={cast.id} value={cast.id}>
                {cast.displayName}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* 状態フィルタ */}
        <div className="relative">
          <select
            value={currentFilters.statuses?.join(",") ?? ""}
            onChange={(e) => updateFilter("status", e.target.value || null)}
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="">全状態</option>
            <option value="trial">トライアル</option>
            <option value="active">契約中</option>
            <option value="past_due">支払い遅延</option>
            <option value="paused">一時停止</option>
            <option value="canceled">解約済み</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* SLAフィルタ */}
        <div className="relative">
          <select
            value={currentFilters.slaStatus ?? "all"}
            onChange={(e) => updateFilter("sla", e.target.value === "all" ? null : e.target.value)}
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="all">全SLA</option>
            <option value="breached">SLA超過中</option>
            <option value="warning">SLA警告圏内</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* ソート */}
        <div className="relative">
          <select
            value={currentFilters.sortBy ?? "priority"}
            onChange={(e) =>
              updateFilter("sort", e.target.value === "priority" ? null : e.target.value)
            }
            className="appearance-none rounded-xl border border-stone-200 bg-white pl-4 pr-8 py-2 text-sm font-medium text-stone-700 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta cursor-pointer hover:bg-stone-50 transition-colors"
          >
            <option value="priority">優先度順</option>
            <option value="unreplied_duration">未返信時間が長い順</option>
            <option value="today_sent_asc">今日の送信が少ない順</option>
            <option value="last_reply_oldest">最終対応が古い順</option>
            <option value="last_message">メッセージ日時順</option>
            <option value="nickname">名前順</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stone-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

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

        {/* フィルタクリア */}
        {hasActiveFilters && (
          <button
            onClick={() => router.push("/inbox")}
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
  );
}
