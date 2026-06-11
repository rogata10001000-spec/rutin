import type { RevenueForecast } from "@/actions/admin/revenue";

type RevenueForecastTableProps = {
  forecast: RevenueForecast;
};

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;
const formatRate = (rate: number) => `${Math.round(rate * 100)}%`;

export function RevenueForecastTable({ forecast }: RevenueForecastTableProps) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-bold text-stone-800">売上予測（試算）</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          予測は `revenue_events` には保存せず、現在の契約・トライアル・解約予定から計算しています。
          トライアル転換率: {formatRate(forecast.trialConversionRate)}
          {forecast.trialConversionRateSource === "default" ? "（初期係数）" : "（直近実績）"}
        </p>
      </div>
      <div className="grid gap-4 border-b p-5 sm:grid-cols-3">
        <div className="rounded-md bg-stone-50 p-4">
          <p className="text-xs font-medium text-stone-500">今月の確定見込みMRR</p>
          <p className="mt-1 text-xl font-bold text-stone-900">
            {formatYen(forecast.totalConfirmedMrrJpy)}
          </p>
        </div>
        <div className="rounded-md bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700">トライアル未確定見込み</p>
          <p className="mt-1 text-xl font-bold text-amber-700">
            {formatYen(forecast.totalTrialProjectedJpy)}
          </p>
        </div>
        <div className="rounded-md bg-terracotta/10 p-4">
          <p className="text-xs font-medium text-terracotta">表示月合計の予測</p>
          <p className="mt-1 text-xl font-bold text-terracotta">
            {formatYen(forecast.totalProjectedJpy)}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                月
              </th>
              <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                確定見込み
              </th>
              <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                未確定（トライアル）
              </th>
              <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                解約予定減
              </th>
              <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                予測合計
              </th>
              <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                契約/トライアル/解約
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white">
            {forecast.months.map((row) => (
              <tr key={row.month} className="hover:bg-stone-50/50">
                <td className="whitespace-nowrap px-5 py-4 font-medium text-stone-800">
                  {row.month}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-stone-800">
                  {formatYen(row.confirmedMrrJpy)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-amber-700">
                  {formatYen(row.trialProjectedJpy)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-stone-500">
                  {row.cancellationDeductionJpy > 0
                    ? `-${formatYen(row.cancellationDeductionJpy)}`
                    : "-"}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-terracotta">
                  {formatYen(row.projectedTotalJpy)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                  {row.activeCount} / {row.trialCount} / {row.cancelingCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
