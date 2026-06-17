import { getFunnelAnalytics, getDailyTrend } from "@/actions/admin/funnel";
import { getCohortAnalysis } from "@/actions/admin/cohort";
import { FunnelDashboard } from "@/components/admin/funnel/FunnelDashboard";
import { CohortTable } from "@/components/admin/funnel/CohortTable";
import { DailyTrend } from "@/components/admin/funnel/DailyTrend";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = params.days ? parseInt(params.days, 10) : 30;

  const [result, trendResult, cohortResult] = await Promise.all([
    getFunnelAnalytics({ days }),
    getDailyTrend({ days }),
    getCohortAnalysis(),
  ]);

  if (!result.ok) {
    return <ErrorState title="ファネル分析を読み込めませんでした" message={result.error.message} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">ファネル分析</h1>
        <p className="mt-1 text-sm text-stone-500">
          友だち追加から契約・継続・解約までの推移、日次トレンド、コホート継続率を確認できます。
        </p>
      </div>

      <div className="space-y-6">
        <FunnelDashboard data={result.data} />
        {trendResult.ok && <DailyTrend points={trendResult.data.points} />}
        {cohortResult.ok && <CohortTable data={cohortResult.data} />}
      </div>
    </div>
  );
}
