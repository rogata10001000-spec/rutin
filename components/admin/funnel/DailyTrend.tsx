import type { DailyTrendPoint } from "@/actions/admin/funnel";

export function DailyTrend({ points }: { points: DailyTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <h2 className="text-sm font-bold text-stone-700">日次トレンド</h2>
        <p className="mt-3 text-sm text-stone-400">
          集計データがまだありません。日次ロールアップ（Cron）の実行後に表示されます。
        </p>
      </div>
    );
  }

  const maxBar = Math.max(1, ...points.map((p) => Math.max(p.subscribe, p.cancel, p.trialStart)));
  const latest = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-stone-700">日次トレンド（契約 vs 解約）</h2>
        <span className="text-xs text-stone-400">
          最新: 継続中 {latest.activeUsers.toLocaleString("ja-JP")}人
        </span>
      </div>

      <div className="mt-4 flex items-end gap-[2px] overflow-x-auto pb-1">
        {points.map((p) => (
          <div key={p.date} className="flex flex-col items-center gap-[1px]" title={`${p.date} 契約${p.subscribe}/解約${p.cancel}`}>
            <div className="flex h-24 items-end gap-[1px]">
              <div
                className="w-1.5 rounded-t bg-terracotta"
                style={{ height: `${(p.subscribe / maxBar) * 100}%` }}
              />
              <div
                className="w-1.5 rounded-t bg-red-400"
                style={{ height: `${(p.cancel / maxBar) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-terracotta" />契約</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-400" />解約</span>
      </div>
    </div>
  );
}
