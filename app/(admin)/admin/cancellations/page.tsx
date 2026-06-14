import { Suspense } from "react";
import { getPendingCancellations } from "@/actions/admin/cancellations";
import { CancellationTable } from "@/components/admin/cancellations/CancellationTable";
import { CancellationFilters } from "@/components/admin/cancellations/CancellationFilters";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import type { PlanCode } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  plan?: string;
};

const planLabel: Record<string, string> = {
  light: "Light",
  standard: "Standard",
  premium: "Premium",
};

export default async function CancellationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const result = await getPendingCancellations({
    planCode: params.plan as PlanCode | undefined,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">解約予定</h1>
        <p className="mt-1 text-sm text-stone-500">
          期間終了時に解約予定のユーザーを確認できます
        </p>
      </div>

      {result.ok && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4">
            <h3 className="text-sm font-medium text-stone-500">解約予定件数</h3>
            <p className="mt-2 text-2xl font-bold text-stone-900">
              {result.data.summary.totalCount}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4">
            <h3 className="text-sm font-medium text-stone-500">今月終了予定</h3>
            <p className="mt-2 text-2xl font-bold text-amber-600">
              {result.data.summary.endingThisMonthCount}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4">
            <h3 className="text-sm font-medium text-stone-500">プラン別内訳</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {result.data.summary.planBreakdown.length > 0 ? (
                result.data.summary.planBreakdown.map((p) => (
                  <span
                    key={p.plan}
                    className="inline-flex items-center whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-0.5 font-medium text-stone-700"
                  >
                    {planLabel[p.plan] ?? p.plan}: {p.count}件
                  </span>
                ))
              ) : (
                <span className="text-stone-400">-</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <Suspense fallback={null}>
          <CancellationFilters />
        </Suspense>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
        <Suspense fallback={<div className="p-4"><TableSkeleton rows={8} /></div>}>
          {result.ok ? (
            <CancellationTable items={result.data.items} />
          ) : (
            <div className="p-4 text-center text-red-600">
              {result.error.message}
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
