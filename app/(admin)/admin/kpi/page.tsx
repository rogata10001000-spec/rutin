import { redirect } from "next/navigation";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { getKpiSnapshot } from "@/actions/admin/kpi";
import { KpiBoard } from "@/components/admin/kpi/KpiBoard";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const auth = await requireAdminOrSupervisor();
  if (!auth) redirect("/inbox");

  const result = await getKpiSnapshot();

  const generatedLabel = result.ok
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(result.data.generatedAt))
    : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-stone-900">KPI</h1>
        {generatedLabel && <p className="text-xs text-stone-400">{generatedLabel} 時点</p>}
      </div>
      {result.ok ? (
        <KpiBoard snapshot={result.data} />
      ) : (
        <ErrorState title="指標を集計できませんでした" message={result.error.message} />
      )}
    </div>
  );
}
