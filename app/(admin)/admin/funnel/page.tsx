import { getFunnelAnalytics } from "@/actions/admin/funnel";
import { FunnelDashboard } from "@/components/admin/funnel/FunnelDashboard";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = params.days ? parseInt(params.days, 10) : 30;
  const result = await getFunnelAnalytics({ days });

  if (!result.ok) {
    return <ErrorState title="ファネル分析を読み込めませんでした" message={result.error.message} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">ファネル分析</h1>
        <p className="mt-1 text-sm text-stone-500">
          友だち追加から契約・継続・解約までの推移と解約理由を確認できます。
        </p>
      </div>
      <FunnelDashboard data={result.data} />
    </div>
  );
}
