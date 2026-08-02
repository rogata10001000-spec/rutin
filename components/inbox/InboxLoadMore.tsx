"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INBOX_PAGE_SIZE, MAX_INBOX_PAGE_SIZE } from "@/lib/inbox-paging";

type InboxLoadMoreProps = {
  /** 現在表示している件数 */
  shownCount: number;
  /** 絞り込み後の総件数 */
  totalCount: number;
  hasMore: boolean;
};

/**
 * 一覧の末尾に置く件数表示と追加読み込み。
 * limit を URL に持たせるので、会話を開いて戻ってきても読み込んだぶんが保たれる。
 */
export function InboxLoadMore({ shownCount, totalCount, hasMore }: InboxLoadMoreProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, startLoading] = useTransition();

  const loadMore = () => {
    const params = new URLSearchParams(searchParams.toString());
    const next = Math.min(shownCount + INBOX_PAGE_SIZE, MAX_INBOX_PAGE_SIZE);
    params.set("limit", String(next));
    startLoading(() => {
      router.push(`/inbox?${params.toString()}`, { scroll: false });
    });
  };

  const reachedCap = shownCount >= MAX_INBOX_PAGE_SIZE;

  return (
    <div className="px-3 pb-4 pt-2 text-center">
      <p className="text-xs text-stone-400">
        {totalCount}人中 {Math.min(shownCount, totalCount)}人を表示中
      </p>

      {hasMore &&
        (reachedCap ? (
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            一度に表示できるのは{MAX_INBOX_PAGE_SIZE}人までです。
            <br />
            絞り込み（未返信・担当・タグなど）で対象を狭めてください。
          </p>
        ) : (
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="mt-2 inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
                読み込み中…
              </>
            ) : (
              `続きを${Math.min(INBOX_PAGE_SIZE, totalCount - shownCount)}人読み込む`
            )}
          </button>
        ))}
    </div>
  );
}
