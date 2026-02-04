"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserListItem } from "@/actions/users";
import { BadgePlan, BadgeStatus, BadgeTag } from "@/components/common/Badge";

type UsersTableProps = {
  items: UserListItem[];
};

export function UsersTable({ items }: UsersTableProps) {
  const router = useRouter();

  // ホバー時にプリフェッチ
  const handlePrefetch = useCallback((userId: string) => {
    router.prefetch(`/users/${userId}`);
    router.prefetch(`/chat/${userId}`);
  }, [router]);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
      {/* モバイル用カード表示 */}
      <div className="divide-y divide-stone-100 lg:hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/users/${item.id}`}
            className="block p-4 transition-colors hover:bg-stone-50"
            onMouseEnter={() => handlePrefetch(item.id)}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-bold text-stone-800">{item.nickname}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgePlan plan={item.planCode as "light" | "standard" | "premium"} />
                  <BadgeStatus status={item.status as "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete"} />
                </div>
                {item.assignedCastName && (
                  <p className="mt-2 text-xs font-medium text-stone-500">
                    担当: {item.assignedCastName}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* デスクトップ用テーブル */}
      <table className="hidden min-w-full divide-y divide-stone-200 lg:table">
        <thead className="bg-stone-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              ユーザー
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              プラン
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              状態
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              担当
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              タグ
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 bg-white">
          {items.map((item) => (
            <tr 
              key={item.id} 
              className="transition-colors hover:bg-stone-50/50"
              onMouseEnter={() => handlePrefetch(item.id)}
            >
              <td className="whitespace-nowrap px-6 py-4">
                <Link
                  href={`/users/${item.id}`}
                  className="font-bold text-stone-800 hover:text-terracotta"
                >
                  {item.nickname}
                </Link>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <BadgePlan plan={item.planCode as "light" | "standard" | "premium"} />
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <BadgeStatus status={item.status as "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete"} />
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                {item.assignedCastName ?? "-"}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag, i) => (
                    <BadgeTag key={i} tag={tag} />
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <Link
                  href={`/chat/${item.id}`}
                  className="text-sm font-medium text-terracotta hover:text-[#d0694e]"
                >
                  チャット
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
