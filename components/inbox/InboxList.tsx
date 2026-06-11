"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { InboxItem } from "@/actions/inbox";
import { BadgePlan, BadgeStatus, BadgeSla, BadgeRisk } from "@/components/common/Badge";

type InboxListProps = {
  items: InboxItem[];
  selectedUserId?: string;
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

export function InboxList({ items, selectedUserId }: InboxListProps) {
  const searchParams = useSearchParams();

  // 各行のリンク: 既存のフィルタ等を維持しつつ user だけ差し替える
  const buildHref = useMemo(() => {
    return (userId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("user", userId);
      return `/inbox?${params.toString()}`;
    };
  }, [searchParams]);

  return (
    <ul className="divide-y divide-stone-100">
      {items.map((item) => {
        const isSelected = item.id === selectedUserId;
        return (
          <li key={item.id} className="relative">
            <span
              className={`absolute inset-y-0 left-0 w-1 ${getAccentClass(item)}`}
              aria-hidden
            />
            <Link
              href={buildHref(item.id)}
              scroll={false}
              aria-current={isSelected ? "true" : undefined}
              className={`block px-4 py-3 pl-5 transition-colors ${
                isSelected ? "bg-terracotta/10" : "hover:bg-stone-50"
              }`}
            >
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
                      isSelected
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

                  {/* 4段目: 担当・タグ */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                    <span className="whitespace-nowrap">
                      担当: {item.assignedCastName ?? "未割当"}
                    </span>
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
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
