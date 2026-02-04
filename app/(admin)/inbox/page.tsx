import { Suspense } from "react";
import { getInboxItems, type InboxFilters as InboxFiltersType } from "@/actions/inbox";
import { getCastOptions } from "@/actions/assignments";
import { InboxTable } from "@/components/inbox/InboxTable";
import { InboxFilters } from "@/components/inbox/InboxFilters";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

type SearchParams = {
  plan?: string;
  status?: string;
  risk?: string;
  unreported?: string;
  reply?: string;
  cast?: string;
  unassigned?: string;
  sort?: string;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  
  const filters: InboxFiltersType = {
    planCodes: params.plan ? params.plan.split(",") : undefined,
    statuses: params.status ? params.status.split(",") : undefined,
    hasRisk: params.risk === "true" ? true : undefined,
    isUnreported: params.unreported === "true" ? true : undefined,
    replyStatus: params.reply as InboxFiltersType["replyStatus"] ?? undefined,
    assignedCastId: params.cast ?? undefined,
    hasUnassigned: params.unassigned === "true" ? true : undefined,
    sortBy: params.sort as InboxFiltersType["sortBy"] ?? undefined,
  };

  // データを並列で取得
  const [result, castsResult] = await Promise.all([
    getInboxItems({ filters }),
    getCastOptions(),
  ]);

  const casts = castsResult.ok
    ? castsResult.data.casts.map((c) => ({ id: c.id, displayName: c.displayName }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">
            受信トレイ
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            全ユーザーを優先度順で表示しています
          </p>
        </div>
        {/* 将来的にここに一括操作ボタンなどを配置 */}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-1 shadow-soft">
        <div className="p-4 border-b border-stone-100">
          <InboxFilters
            currentFilters={filters}
            casts={casts}
            summary={result.ok ? result.data.summary : undefined}
          />
        </div>
        
        <div className="p-4">
          <Suspense fallback={<div className="py-8"><TableSkeleton rows={10} /></div>}>
            {result.ok ? (
              result.data.items.length > 0 ? (
                <InboxTable items={result.data.items} />
              ) : (
                <EmptyState
                  title="該当するユーザーがいません"
                  description="フィルタ条件を変更してみてください"
                />
              )
            ) : (
              <div className="rounded-xl bg-red-50 p-4 text-center text-destructive">
                {result.error.message}
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
