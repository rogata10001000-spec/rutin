import { getAnalytics } from "@/actions/analytics";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const result = await getAnalytics(7);

  if (!result.ok) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center text-red-600">
        {result.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">
          アナリティクス
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          直近7日間のサービス品質指標
        </p>
      </div>

      <AnalyticsDashboard data={result.data} />
    </div>
  );
}
