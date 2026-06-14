import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getRevenueForecast, getRevenueSummary } from "@/actions/admin/revenue";
import type { RevenuePeriodPreset } from "@/actions/admin/revenue";
import { RevenueSummaryCards } from "@/components/admin/revenue/RevenueSummaryCards";
import { RevenueBreakdown } from "@/components/admin/revenue/RevenueBreakdown";
import { MateRevenueTable } from "@/components/admin/revenue/MateRevenueTable";
import { RevenuePeriodFilter } from "@/components/admin/revenue/RevenuePeriodFilter";
import { RevenueForecastTable } from "@/components/admin/revenue/RevenueForecastTable";

export const dynamic = "force-dynamic";

type SearchParams = {
  preset?: string;
  from?: string;
  to?: string;
};

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAdmin();
  if (!auth) {
    redirect("/inbox");
  }

  const params = await searchParams;
  const preset = (params.preset ?? "current_month") as RevenuePeriodPreset;

  const [result, forecastResult] = await Promise.all([
    getRevenueSummary({
      preset,
      periodFrom: params.from,
      periodTo: params.to,
    }),
    getRevenueForecast(6),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">売上ダッシュボード</h1>
        <p className="mt-1 text-sm text-stone-500">
          システム全体・メイト別・本部取り分の売上を確認できます
        </p>
        {result.ok && (
          <p className="mt-1 text-xs text-stone-400">
            集計期間: {result.data.periodFrom} 〜 {result.data.periodTo}（JST）
          </p>
        )}
      </div>

      <div className="mb-6">
        <Suspense fallback={null}>
          <RevenuePeriodFilter />
        </Suspense>
      </div>

      {result.ok ? (
        <div className="space-y-6">
          <RevenueSummaryCards summary={result.data.summary} />
          {forecastResult.ok ? (
            <RevenueForecastTable forecast={forecastResult.data} />
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4 text-center text-red-600">
              {forecastResult.error.message}
            </div>
          )}
          <RevenueBreakdown breakdown={result.data.summary.breakdown} />
          <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-bold text-stone-800">メイト別売上</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                メイトへの配分額（税抜）。精算画面と同じ基準です。
              </p>
            </div>
            <MateRevenueTable items={result.data.summary.mateRows} />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4 text-center text-red-600">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
