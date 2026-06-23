import type { AcquisitionAnalytics } from "@/actions/admin/funnel";

function formatRate(rate: number | null): string {
  if (rate === null) return "-";
  return `${(rate * 100).toFixed(1)}%`;
}

export function AcquisitionBreakdown({ data }: { data: AcquisitionAnalytics }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-stone-900">流入元分析</h2>
        <p className="mt-1 text-sm text-stone-500">
          公式LINEを追加した経路（サイト/広告）別の追加数と契約転換率（直近{data.periodDays}日）。
        </p>
      </div>

      {data.sources.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-400">対象期間のデータがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs font-bold uppercase tracking-wide text-stone-500">
                <th className="whitespace-nowrap py-2 pr-4">流入元</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">追加</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">契約・トライアル</th>
                <th className="whitespace-nowrap py-2 text-right">転換率</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((row) => (
                <tr key={row.source} className="border-b border-stone-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-stone-800">{row.source}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-stone-700">
                    {row.added.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-stone-700">
                    {row.contracted.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums font-bold text-stone-800">
                    {formatRate(row.conversionRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
