import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getAiStats } from "@/actions/admin/ai-stats";
import { AiStatsDashboard } from "@/components/admin/ai-stats/AiStatsDashboard";
import { AiStatsPeriodTabs } from "@/components/admin/ai-stats/AiStatsPeriodTabs";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function AiStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/inbox");
  }

  const params = await searchParams;
  const days = params.days ? Number.parseInt(params.days, 10) : 7;
  const result = await getAiStats({ days: Number.isNaN(days) ? 7 : days });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">AI利用状況</h1>
        <p className="mt-1 text-sm text-stone-500">
          AIの下書きが実際に使われているか、いくらかかっているかを確認できます。
        </p>
      </div>

      <div className="mb-6">
        <Suspense fallback={null}>
          <AiStatsPeriodTabs current={result.ok ? result.data.periodDays : 7} />
        </Suspense>
      </div>

      {result.ok ? (
        <AiStatsDashboard data={result.data} />
      ) : (
        <ErrorState
          title="AI利用状況を読み込めませんでした"
          message={`${result.error.message}。時間をおいて再読み込みしてください。`}
        />
      )}
    </div>
  );
}
