import Link from "next/link";
import type { FunnelAnalytics } from "@/actions/admin/funnel";

type FunnelDashboardProps = {
  data: FunnelAnalytics;
};

const PERIODS = [
  { days: 7, label: "7日間" },
  { days: 30, label: "30日間" },
  { days: 90, label: "90日間" },
];

const STATUS_LABELS: Record<string, string> = {
  incomplete: "未契約",
  trial: "トライアル",
  active: "契約中",
  past_due: "支払い遅延",
  paused: "一時停止",
  canceled: "解約済み",
};

const STATUS_ORDER = ["incomplete", "trial", "active", "past_due", "paused", "canceled"];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-stone-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function FunnelDashboard({ data }: FunnelDashboardProps) {
  const { events, statusCounts, cancelReasons, rates, periodDays } = data;

  const funnelStages = [
    { label: "友だち追加", value: events.lineFollow, color: "bg-stone-400" },
    { label: "トライアル開始", value: events.trialStart, color: "bg-sage" },
    { label: "課金転換", value: events.subscribe, color: "bg-terracotta" },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.value));

  const totalCancelReasons = cancelReasons.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6">
      {/* 期間切替 */}
      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.days}
            href={`/admin/funnel?days=${p.days}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              periodDays === p.days
                ? "bg-terracotta text-white shadow-sm"
                : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-medium text-stone-500">友だち追加→トライアル開始</p>
          <p className="mt-2 text-3xl font-black text-stone-800">
            {rates.followToTrial !== null ? `${rates.followToTrial}%` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-medium text-stone-500">トライアル→課金転換（概算）</p>
          <p className="mt-2 text-3xl font-black text-stone-800">
            {rates.trialToPaid !== null ? `${rates.trialToPaid}%` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-medium text-stone-500">解約予約（期間内）</p>
          <p className="mt-2 text-3xl font-black text-amber-600">{events.cancelScheduled}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
          <p className="text-xs font-medium text-stone-500">再開（期間内）</p>
          <p className="mt-2 text-3xl font-black text-sage">{events.resume}</p>
        </div>
      </div>

      {/* ファネル */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <h2 className="text-sm font-bold text-stone-700">獲得ファネル（期間内のイベント数）</h2>
        <div className="mt-4 space-y-4">
          {funnelStages.map((stage) => (
            <div key={stage.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-stone-600">{stage.label}</span>
                <span className="font-bold text-stone-800">{stage.value}</span>
              </div>
              <Bar value={stage.value} max={funnelMax} color={stage.color} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-400">
          ※ 課金転換はトライアル経由・即時契約の両方を含みます。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 現在のステータス内訳 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
          <h2 className="text-sm font-bold text-stone-700">現在のユーザー内訳</h2>
          <div className="mt-4 space-y-2">
            {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{STATUS_LABELS[s] ?? s}</span>
                <span className="font-bold text-stone-800">{statusCounts[s]}人</span>
              </div>
            ))}
            {Object.keys(statusCounts).length === 0 && (
              <p className="text-sm text-stone-400">データがありません</p>
            )}
          </div>
        </div>

        {/* 解約理由 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
          <h2 className="text-sm font-bold text-stone-700">解約理由（期間内）</h2>
          <div className="mt-4 space-y-3">
            {cancelReasons.length === 0 ? (
              <p className="text-sm text-stone-400">この期間の解約はありません</p>
            ) : (
              cancelReasons.map((r) => (
                <div key={r.code}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-stone-600">{r.label}</span>
                    <span className="font-bold text-stone-800">{r.count}件</span>
                  </div>
                  <Bar value={r.count} max={Math.max(1, totalCancelReasons)} color="bg-red-400" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
