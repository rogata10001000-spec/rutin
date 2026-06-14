import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getMarketingSummary, type MarketingPeriodPreset } from "@/actions/admin/marketing";
import { MarketingDashboard } from "@/components/admin/marketing/MarketingDashboard";
import { MarketingPeriodFilter } from "@/components/admin/marketing/MarketingPeriodFilter";

export const dynamic = "force-dynamic";

type SearchParams = {
  preset?: string;
  from?: string;
  to?: string;
};

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAdmin();
  if (!auth) {
    redirect("/inbox");
  }

  const params = await searchParams;
  const result = await getMarketingSummary({
    preset: (params.preset ?? "current_month") as MarketingPeriodPreset,
    periodFrom: params.from,
    periodTo: params.to,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">マーケ分析</h1>
        <p className="mt-1 text-sm text-stone-500">
          解約率・クロージング率・プラン構成比・メイト別スコアを確認できます
        </p>
        {result.ok && (
          <p className="mt-1 text-xs text-stone-400">
            集計期間: {result.data.periodFrom} 〜 {result.data.periodTo}（JST）
          </p>
        )}
      </div>

      <div className="mb-6">
        <Suspense fallback={null}>
          <MarketingPeriodFilter />
        </Suspense>
      </div>

      {result.ok ? (
        <MarketingDashboard summary={result.data} />
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4 text-center text-red-600">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
