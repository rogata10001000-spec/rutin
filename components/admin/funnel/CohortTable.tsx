import type { CohortAnalytics } from "@/actions/admin/cohort";

function retentionClass(pct: number): string {
  if (pct >= 70) return "bg-sage/20 text-sage-800";
  if (pct >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

const formatYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function CohortTable({ data }: { data: CohortAnalytics }) {
  const { offsets, cohorts } = data;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
      <h2 className="text-sm font-bold text-stone-700">契約開始月コホート（継続率・累計売上）</h2>
      <p className="mt-1 text-xs text-stone-400">
        各月に契約を開始したユーザーが、その後Nヶ月後も継続している割合。— は測定不能（未来）。
      </p>

      {cohorts.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">
          まだデータがありません。契約を開始したユーザーが増えると、開始月ごとの継続率がここに表示されます。
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-500">
                <th className="whitespace-nowrap py-2 pr-4 text-left font-bold">開始月</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-bold">人数</th>
                {offsets.map((o) => (
                  <th key={o} className="whitespace-nowrap px-2 py-2 text-center font-bold">
                    M{o}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-right font-bold">累計売上</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {cohorts.map((c) => (
                <tr key={c.cohortMonth}>
                  <td className="whitespace-nowrap py-2 pr-4 font-bold text-stone-800">{c.cohortMonth}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-stone-600">{c.users}</td>
                  {c.retention.map((r, i) => (
                    <td key={i} className="px-1 py-2 text-center">
                      {r === null ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        <span className={`inline-block min-w-[2.75rem] rounded px-1.5 py-0.5 text-xs font-bold ${retentionClass(r)}`}>
                          {r}%
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-stone-700">
                    {formatYen(c.cumulativeRevenue)}
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
