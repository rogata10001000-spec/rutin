"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InboxItem } from "@/actions/inbox";
import { BadgePlan, BadgeStatus, BadgeSla, BadgeRisk, BadgeTag } from "@/components/common/Badge";

type InboxTableProps = {
  items: InboxItem[];
};

// 返信状態バッジ
function ReplyStatusBadge({ status, todaySentCount }: { status: InboxItem["replyStatus"]; todaySentCount: number }) {
  if (status === "unreplied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        未返信
      </span>
    );
  }
  if (status === "not_sent_today") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
        今日未送信
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
      対応済 ({todaySentCount}件)
    </span>
  );
}

// 時刻のフォーマット
function formatTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 60) {
    return `${diffMinutes}分前`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}時間前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}日前`;
  }
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// 行の背景色を決定
function getRowBgClass(item: InboxItem): string {
  if (item.hasRisk) return "bg-red-50";
  if (item.replyStatus === "unreplied") return "bg-red-50/50";
  if (item.replyStatus === "not_sent_today") return "bg-amber-50/50";
  return "";
}

export function InboxTable({ items }: InboxTableProps) {
  const router = useRouter();

  // ホバー時にプリフェッチ
  const handlePrefetch = useCallback((userId: string) => {
    router.prefetch(`/chat/${userId}`);
    router.prefetch(`/users/${userId}`);
  }, [router]);

  return (
    <div className="overflow-x-auto">
      {/* モバイル用カード表示 */}
      <div className="divide-y lg:hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/chat/${item.id}`}
            className={`block p-4 hover:bg-gray-50 ${getRowBgClass(item)}`}
            onMouseEnter={() => handlePrefetch(item.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{item.nickname}</span>
                  {item.hasRisk && <BadgeRisk level={item.riskLevel ?? undefined} />}
                  {item.isBirthdayToday && <span className="text-lg">🎂</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <ReplyStatusBadge status={item.replyStatus} todaySentCount={item.todaySentCount} />
                  <BadgePlan plan={item.planCode} />
                  <BadgeStatus status={item.status} />
                </div>
                {item.slaRemainingMinutes !== null && (
                  <div className="mt-1.5">
                    <BadgeSla
                      remainingMinutes={item.slaRemainingMinutes}
                      warningMinutes={item.slaWarningMinutes}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  {item.assignedCastName && (
                    <span>担当: {item.assignedCastName}</span>
                  )}
                  <span>受信: {formatTime(item.lastUserMessageAt)}</span>
                  <span>送信: {formatTime(item.lastCastMessageAt)}</span>
                </div>
              </div>
              <div className="text-right">
                {item.isUnreported && (
                  <span className="text-xs text-orange-600">未報告</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* デスクトップ用テーブル表示 */}
      <table className="hidden min-w-full divide-y divide-gray-200 lg:table">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              ユーザー
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              返信状態
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              プラン
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              状態
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              担当メイト
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              最終受信
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              最終送信
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              SLA
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              フラグ
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {items.map((item) => (
            <tr
              key={item.id}
              className={`hover:bg-gray-100 transition-colors ${getRowBgClass(item)}`}
              onMouseEnter={() => handlePrefetch(item.id)}
            >
              <td className="whitespace-nowrap px-4 py-3">
                <Link
                  href={`/chat/${item.id}`}
                  className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800"
                >
                  {item.nickname}
                  {item.isBirthdayToday && <span>🎂</span>}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <ReplyStatusBadge status={item.replyStatus} todaySentCount={item.todaySentCount} />
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <BadgePlan plan={item.planCode} />
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <BadgeStatus status={item.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {item.assignedCastName ?? (
                  <span className="text-gray-400">未割当</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {formatTime(item.lastUserMessageAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {formatTime(item.lastCastMessageAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {item.slaRemainingMinutes !== null ? (
                  <BadgeSla
                    remainingMinutes={item.slaRemainingMinutes}
                    warningMinutes={item.slaWarningMinutes}
                  />
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {item.hasRisk && <BadgeRisk level={item.riskLevel ?? undefined} />}
                  {item.isUnreported && (
                    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      未報告
                    </span>
                  )}
                  {item.tags.length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {item.tags.length}タグ
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
