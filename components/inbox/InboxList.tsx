"use client";

import { useCallback, useMemo } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { InboxItem } from "@/actions/inbox";
import type { StaffRole } from "@/lib/supabase/types";
import { BadgePlan, BadgeStatus, BadgeSla, BadgeRisk } from "@/components/common/Badge";

type InboxListProps = {
  items: InboxItem[];
  selectedUserId?: string;
  role?: StaffRole;
  /** 一斉送信の選択モード。true の間は行タップで選択をトグルする（遷移しない） */
  selectionMode?: boolean;
  /** 選択中のユーザーID群（selectionMode時のみ使用） */
  checkedIds?: ReadonlySet<string>;
  /** 行タップで選択をトグル */
  onToggleCheck?: (userId: string) => void;
};

// 時刻のフォーマット
function formatTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "たった今";
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// 選択されていない行の左端アクセント色
function getAccentClass(item: InboxItem): string {
  if (item.hasUnread) return "bg-terracotta";
  if (item.hasRisk) return "bg-red-500";
  if (item.replyStatus === "unreplied") return "bg-red-400";
  if (item.replyStatus === "not_sent_today") return "bg-amber-400";
  return "bg-transparent";
}

function getPreviewText(item: InboxItem): string {
  if (!item.lastMessageBody) return "メッセージはまだありません";
  const prefix = item.lastMessageDirection === "out" ? "自分: " : "相手: ";
  return `${prefix}${item.lastMessageBody.replace(/\s+/g, " ").trim()}`;
}

function getUnreadBadgeLabel(unreadCount: number): string {
  if (unreadCount > 99) return "99+";
  return String(unreadCount);
}

// 行タップ後〜チャット表示までの待ち時間を可視化するスピナー（Link配下でのみ動作）
function RowPendingSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
      <svg className="h-4 w-4 animate-spin text-terracotta" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </span>
  );
}

// 返信状態の小バッジ
function ReplyDot({ status }: { status: InboxItem["replyStatus"] }) {
  if (status === "unreplied") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        未返信
      </span>
    );
  }
  if (status === "not_sent_today") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
        今日未送信
      </span>
    );
  }
  return null;
}

export function InboxList({
  items,
  selectedUserId,
  role,
  selectionMode = false,
  checkedIds,
  onToggleCheck,
}: InboxListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // メイト本人は全員が自分の担当なので「担当: ◯◯」は冗長。非表示にしてノイズを減らす。
  const showAssignee = role !== "cast";

  // 各行のリンク: 既存のフィルタ等を維持しつつ user だけ差し替える
  const buildHref = useMemo(() => {
    return (userId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("user", userId);
      return `/inbox?${params.toString()}`;
    };
  }, [searchParams]);

  // ホバー時に遷移先（チャット）を先読みしてクリック後の表示を即時化する。
  // Next.js が同一URLのプリフェッチを重複排除するため、なぞっても過剰には走らない。
  const handlePrefetch = useCallback(
    (userId: string) => {
      router.prefetch(buildHref(userId));
    },
    [router, buildHref]
  );

  return (
    <ul className="divide-y divide-stone-100">
      {items.map((item) => {
        const isSelected = !selectionMode && item.id === selectedUserId;
        const isChecked = selectionMode && !!checkedIds?.has(item.id);

        const rowInner = (
          <div className="flex items-start gap-3">
            {/* アバター */}
            {item.linePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.linePictureUrl}
                alt={`${item.displayName}のプロフィール画像`}
                className="h-10 w-10 shrink-0 rounded-full border border-stone-200 object-cover"
              />
            ) : (
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isSelected || isChecked
                    ? "bg-terracotta text-white"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {item.displayName.charAt(0)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              {/* 1段目: 名前 + 時刻 */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`flex min-w-0 items-center gap-1 ${
                    item.hasUnread ? "font-extrabold text-stone-900" : "font-bold text-stone-800"
                  }`}
                >
                  <span className="truncate">{item.displayName}</span>
                  {item.isBirthdayToday && <span aria-hidden>🎂</span>}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="whitespace-nowrap text-[11px] text-stone-400">
                    {formatTime(item.lastMessageAt ?? item.lastUserMessageAt)}
                  </span>
                  {item.hasUnread ? (
                    <span className="inline-flex min-w-[1.35rem] items-center justify-center whitespace-nowrap rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {getUnreadBadgeLabel(item.unreadCount)}
                    </span>
                  ) : (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.replyStatus === "unreplied"
                          ? "bg-red-400"
                          : item.replyStatus === "not_sent_today"
                            ? "bg-amber-400"
                            : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                  )}
                </div>
              </div>

              {/* 2段目: 直近メッセージプレビュー */}
              <p
                className={`mt-1 truncate text-sm ${
                  item.hasUnread ? "font-semibold text-stone-700" : "text-stone-500"
                }`}
              >
                {getPreviewText(item)}
              </p>

              {/* 3段目: 状態バッジ */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ReplyDot status={item.replyStatus} />
                <BadgePlan plan={item.planCode} />
                <BadgeStatus status={item.status} />
                {item.hasRisk && <BadgeRisk level={item.riskLevel ?? undefined} />}
                {item.isUnreported && (
                  <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                    未報告
                  </span>
                )}
                {item.slaRemainingMinutes !== null && (
                  <BadgeSla
                    remainingMinutes={item.slaRemainingMinutes}
                    warningMinutes={item.slaWarningMinutes}
                  />
                )}
              </div>

              {/* 4段目: 担当・タグ（メイトは担当を省略。情報が無ければ行ごと省く） */}
              {(showAssignee || item.lineAccountName || item.tags.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                  {showAssignee && (
                    <span className="whitespace-nowrap">
                      担当: {item.assignedCastName ?? "未割当"}
                    </span>
                  )}
                  {item.lineAccountName && (
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      {item.lineAccountName}
                    </span>
                  )}
                  {item.tags.length > 0 && (
                    <span className="truncate">
                      {item.tags.slice(0, 3).join(" / ")}
                      {item.tags.length > 3 && ` +${item.tags.length - 3}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );

        return (
          <li key={item.id} className="relative">
            <span
              className={`absolute inset-y-0 left-0 w-1 ${getAccentClass(item)}`}
              aria-hidden
            />
            {selectionMode ? (
              <button
                type="button"
                onClick={() => onToggleCheck?.(item.id)}
                aria-pressed={isChecked}
                className={`block w-full px-4 py-3 pl-5 pr-12 text-left transition-colors ${
                  isChecked ? "bg-terracotta/10" : "hover:bg-stone-50"
                }`}
              >
                {rowInner}
                {/* 選択チェック（右中央・44px級のタップは行全体で担保） */}
                <span
                  className={`absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors ${
                    isChecked
                      ? "border-terracotta bg-terracotta text-white"
                      : "border-stone-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {isChecked && (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              </button>
            ) : (
              <Link
                href={buildHref(item.id)}
                scroll={false}
                onMouseEnter={() => handlePrefetch(item.id)}
                // タッチにはホバーが無いため、指が触れた瞬間（click発火前）に先読みを開始する
                onPointerDown={() => handlePrefetch(item.id)}
                aria-current={isSelected ? "true" : undefined}
                className={`block px-4 py-3 pl-5 transition-colors active:bg-stone-100 ${
                  isSelected ? "bg-terracotta/10" : "hover:bg-stone-50"
                }`}
              >
                {rowInner}
                <RowPendingSpinner />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
