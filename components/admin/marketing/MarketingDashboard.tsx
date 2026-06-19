import type { MarketingSummary } from "@/actions/admin/marketing";

type MarketingDashboardProps = {
  summary: MarketingSummary;
};

const formatYen = (amount: number | null) =>
  amount === null ? "-" : `¥${amount.toLocaleString("ja-JP")}`;
const formatRate = (rate: number | null) => (rate === null ? "-" : `${Math.round(rate * 100)}%`);
const formatDays = (days: number | null) => (days === null ? "-" : `${days.toFixed(1)}日`);

const planLabel: Record<string, string> = {
  light: "Light",
  standard: "Standard",
  premium: "Premium",
};

function KpiCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-4">
      <h3 className="text-sm font-medium text-stone-500">{label}</h3>
      <p className="mt-2 text-2xl font-bold text-stone-900">{value}</p>
      {note && <p className="mt-1 text-xs text-stone-500">{note}</p>}
    </div>
  );
}

export function MarketingDashboard({ summary }: MarketingDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="クロージング率" value={formatRate(summary.closingRate)} note={`${summary.lineFollows}追加 / ${summary.subscriptions}契約`} />
        <KpiCard label="解約率" value={formatRate(summary.churnRate)} note={`${summary.cancellations}解約`} />
        <KpiCard label="トライアル転換率" value={formatRate(summary.trialConversionRate)} note={`${summary.trialStarts}開始 / ${summary.subscriptions}契約`} />
        <KpiCard label="純増数" value={summary.netAdds} note="新規契約 - 解約" />
        <KpiCard label="推定MRR" value={formatYen(summary.estimatedMrrJpy)} note={`${summary.activeUsers} active`} />
        <KpiCard label="ARPU" value={formatYen(summary.arpuJpy)} note="推定MRR / active人数" />
        <KpiCard label="LTV近似" value={formatYen(summary.ltvApproxJpy)} note="ARPU / 月次解約率" />
        <KpiCard label="平均リードタイム" value={formatDays(summary.avgLeadTimeDays)} note="LINE追加 → 契約" />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft p-5">
        <div>
          <h2 className="text-sm font-bold text-stone-800">プラン構成比</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            比率・MRR は active / past_due / paused が対象。トライアル中は人数のみ併記しています。
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {summary.planBreakdown.map((plan) => (
            <div key={plan.planCode} className="rounded-md bg-stone-50 p-4">
              <p className="text-xs font-medium text-stone-500">{planLabel[plan.planCode]}</p>
              <p className="mt-1 text-xl font-bold text-stone-800">
                {plan.count}人 / {formatRate(plan.ratio)}
              </p>
              <p className="mt-1 text-xs text-stone-500">MRR {formatYen(plan.estimatedMrrJpy)}</p>
              {plan.trialCount > 0 && (
                <p className="mt-1 text-xs font-medium text-amber-600">
                  トライアル中 {plan.trialCount}人
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-bold text-stone-800">メイト別スコアカード</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            担当人数・契約数・解約率・転換率・推定MRRをまとめて確認できます。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  メイト
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  担当
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  契約中
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  トライアル
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  解約率
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  クロージング率
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  転換率
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  推定MRR
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  リードタイム
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {summary.castScorecards.map((cast) => (
                <tr key={cast.castId ?? "unassigned"} className="hover:bg-stone-50/50">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-stone-800">
                    {cast.castName}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {cast.assignedCount}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {cast.activeCount}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {cast.trialCount}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatRate(cast.churnRate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatRate(cast.closingRate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatRate(cast.trialConversionRate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-stone-800">
                    {formatYen(cast.estimatedMrrJpy)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatDays(cast.avgLeadTimeDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
