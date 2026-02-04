"use client";

/**
 * 基本スケルトンコンポーネント（シマー効果付き）
 */
export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:1000px_100%] ${className}`}
    />
  );
}

/**
 * テーブル用スケルトン
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* ヘッダー */}
      <div className="flex gap-4 border-b pb-3">
        <LoadingSkeleton className="h-4 w-32" />
        <LoadingSkeleton className="h-4 w-24" />
        <LoadingSkeleton className="h-4 w-24" />
        <LoadingSkeleton className="h-4 w-20" />
        <LoadingSkeleton className="h-4 w-28" />
      </div>
      {/* 行 */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          <LoadingSkeleton className="h-4 w-32" />
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-4 w-20" />
          <LoadingSkeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * カード用スケルトン
 */
export function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-6">
      <LoadingSkeleton className="mb-4 h-6 w-1/3" />
      <LoadingSkeleton className="mb-2 h-4 w-full" />
      <LoadingSkeleton className="mb-2 h-4 w-2/3" />
      <LoadingSkeleton className="h-4 w-1/2" />
    </div>
  );
}

/**
 * チャット履歴用スケルトン
 */
export function ChatSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
        >
          <div
            className={`flex max-w-[70%] flex-col ${
              i % 2 === 0 ? "items-start" : "items-end"
            }`}
          >
            <LoadingSkeleton className="h-16 w-64 rounded-2xl" />
            <LoadingSkeleton className="mt-1 h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * メモセクション用スケルトン
 */
export function MemoSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <LoadingSkeleton className="h-4 w-20" />
            <LoadingSkeleton className="h-4 w-12" />
          </div>
          <LoadingSkeleton className="mb-2 h-4 w-full" />
          <LoadingSkeleton className="mb-2 h-4 w-3/4" />
          <LoadingSkeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/**
 * ユーザー詳細カード用スケルトン
 */
export function UserDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* ヘッダーカード */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center gap-4">
          <LoadingSkeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1">
            <LoadingSkeleton className="mb-2 h-6 w-32" />
            <LoadingSkeleton className="h-4 w-48" />
          </div>
        </div>
      </div>

      {/* サブスクリプションカード */}
      <div className="rounded-lg border bg-white p-6">
        <LoadingSkeleton className="mb-4 h-5 w-24" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <LoadingSkeleton className="mb-1 h-3 w-16" />
            <LoadingSkeleton className="h-5 w-24" />
          </div>
          <div>
            <LoadingSkeleton className="mb-1 h-3 w-16" />
            <LoadingSkeleton className="h-5 w-24" />
          </div>
        </div>
      </div>

      {/* メモカード */}
      <div className="rounded-lg border bg-white p-6">
        <LoadingSkeleton className="mb-4 h-5 w-16" />
        <MemoSkeleton count={2} />
      </div>
    </div>
  );
}

/**
 * インボックス行用スケルトン（モバイル対応）
 */
export function InboxRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-white p-4 lg:flex lg:items-center lg:gap-4 lg:p-3"
        >
          {/* モバイル表示 */}
          <div className="lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <LoadingSkeleton className="h-5 w-24" />
              <LoadingSkeleton className="h-5 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <LoadingSkeleton className="h-4 w-16" />
              <LoadingSkeleton className="h-4 w-20" />
            </div>
          </div>
          {/* デスクトップ表示 */}
          <div className="hidden lg:flex lg:flex-1 lg:items-center lg:gap-4">
            <LoadingSkeleton className="h-4 w-32" />
            <LoadingSkeleton className="h-5 w-16 rounded-full" />
            <LoadingSkeleton className="h-5 w-16 rounded-full" />
            <LoadingSkeleton className="h-4 w-24" />
            <LoadingSkeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
