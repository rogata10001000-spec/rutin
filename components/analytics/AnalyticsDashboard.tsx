"use client";

import type { AnalyticsSummary } from "@/actions/analytics";

type Props = {
  data: AnalyticsSummary;
};

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "red" | "green" | "amber" | "blue";
}) {
  const accentMap = {
    red: "border-red-200 bg-red-50",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    blue: "border-blue-200 bg-blue-50",
  };
  const bg = accent ? accentMap[accent] : "border-stone-200 bg-white";

  return (
    <div className={`rounded-2xl border p-5 shadow-soft ${bg}`}>
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-stone-800">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "-";
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

export function AnalyticsDashboard({ data }: Props) {
  const totalToday = data.todayTotalReplied + data.todayTotalUnreplied;
  const todayProgress =
    totalToday > 0
      ? Math.round((data.todayTotalReplied / totalToday) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="全体SLA遵守率"
          value={
            data.overallSlaComplianceRate !== null
              ? `${data.overallSlaComplianceRate}%`
              : "-"
          }
          sub="直近7日間"
          accent={
            data.overallSlaComplianceRate !== null && data.overallSlaComplianceRate >= 90
              ? "green"
              : data.overallSlaComplianceRate !== null && data.overallSlaComplianceRate >= 70
              ? "amber"
              : data.overallSlaComplianceRate !== null
              ? "red"
              : undefined
          }
        />
        <StatCard
          label="平均レスポンス"
          value={formatMinutes(data.avgResponseMinutes)}
          sub="直近7日間"
          accent="blue"
        />
        <StatCard
          label="今日の対応率"
          value={`${todayProgress}%`}
          sub={`${data.todayTotalReplied}/${totalToday}人対応済み`}
          accent={todayProgress >= 80 ? "green" : todayProgress >= 50 ? "amber" : "red"}
        />
        <StatCard
          label="SLA超過件数"
          value={data.recentSlaBreaches}
          sub="直近7日間"
          accent={data.recentSlaBreaches > 0 ? "red" : "green"}
        />
      </div>

      {/* ユーザー概要 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="総ユーザー" value={data.totalUsers} />
        <StatCard label="契約中" value={data.activeUsers} accent="green" />
        <StatCard label="トライアル" value={data.trialUsers} accent="amber" />
      </div>

      {/* プラン別指標 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-bold text-stone-800">プラン別指標</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                  プラン
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                  ユーザー数
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                  平均レスポンス
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                  SLA遵守率
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {data.planBreakdown.map((p) => (
                <tr key={p.plan}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-800">
                    {p.plan.charAt(0).toUpperCase() + p.plan.slice(1)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-stone-600">
                    {p.count}人
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-stone-600">
                    {formatMinutes(p.avgResponse)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {p.slaRate !== null ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          p.slaRate >= 90
                            ? "bg-green-100 text-green-700"
                            : p.slaRate >= 70
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p.slaRate}%
                      </span>
                    ) : (
                      <span className="text-sm text-stone-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* メイト別ワークロード */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-bold text-stone-800">
          メイト別ワークロード
        </h2>
        {data.castWorkloads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                    メイト
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    担当数
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    未返信
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    今日対応済
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    今日未対応
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    平均レスポンス
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    SLA遵守率
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500">
                    均一性
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {data.castWorkloads.map((cast) => (
                  <tr key={cast.castId}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-800">
                      {cast.castName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-stone-600">
                      {cast.assignedCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {cast.unrepliedCount > 0 ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                          {cast.unrepliedCount}
                        </span>
                      ) : (
                        <span className="text-sm text-stone-400">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-600 font-medium">
                      {cast.todayRepliedCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {cast.todayUnrepliedCount > 0 ? (
                        <span className="text-sm font-medium text-amber-600">
                          {cast.todayUnrepliedCount}
                        </span>
                      ) : (
                        <span className="text-sm text-stone-400">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-stone-600">
                      {formatMinutes(cast.avgResponseMinutes)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {cast.slaComplianceRate !== null ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            cast.slaComplianceRate >= 90
                              ? "bg-green-100 text-green-700"
                              : cast.slaComplianceRate >= 70
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {cast.slaComplianceRate}%
                        </span>
                      ) : (
                        <span className="text-sm text-stone-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {cast.uniformityScore !== null ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            cast.uniformityScore >= 80
                              ? "bg-green-100 text-green-700"
                              : cast.uniformityScore >= 50
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {cast.uniformityScore}
                        </span>
                      ) : (
                        <span className="text-sm text-stone-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-sm text-stone-400 py-8">
            メイトデータがありません
          </p>
        )}
      </div>
    </div>
  );
}
