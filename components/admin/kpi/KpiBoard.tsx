import type { KpiMetric, KpiSnapshot, KpiStaffRow } from "@/lib/kpi-metrics";
import { formatKpiValue, type KpiStatus, type KpiTier } from "@/lib/kpi-targets";

/**
 * 検証指標（KPI）の一覧。P0 → P1 → P2 の順。
 * 説明文は置かず「現在値・目標・状態」の3点だけで読めるようにする。
 * 目標値と判定は lib/kpi-targets.ts（日次通知と共有）。
 */

const TIER_TITLE: Record<KpiTier, { title: string; sub: string }> = {
  p0: { title: "P0 事業が成立するか", sub: "毎日見る" },
  p1: { title: "P1 1人で回っているか", sub: "毎日見る" },
  p2: { title: "P2 価値が出ているか", sub: "週次" },
};

const STATUS_META: Record<KpiStatus, { label: string; className: string; value: string }> = {
  achieved: { label: "達成", className: "bg-sage/20 text-sage-800", value: "text-stone-900" },
  warn: { label: "注意", className: "bg-amber-100 text-amber-800", value: "text-amber-700" },
  bad: { label: "未達", className: "bg-red-100 text-red-700", value: "text-red-700" },
  insufficient: { label: "データ不足", className: "bg-stone-100 text-stone-500", value: "text-stone-400" },
  none: { label: "参考", className: "bg-stone-100 text-stone-500", value: "text-stone-900" },
};

function MetricRow({ m }: { m: KpiMetric }) {
  const s = STATUS_META[m.status];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 sm:flex-nowrap">
      <span className="w-full min-w-0 text-sm text-stone-700 sm:w-72 sm:shrink-0">{m.label}</span>
      <span className={`w-28 shrink-0 text-2xl font-bold tabular-nums tracking-tight ${s.value}`}>
        {formatKpiValue(m.unit, m.value)}
      </span>
      <span className="w-24 shrink-0 text-xs tabular-nums text-stone-400">{m.targetLabel}</span>
      <span
        className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${s.className}`}
      >
        {s.label}
      </span>
      {m.detail && (
        <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-stone-400" title={m.detail}>
          {m.detail}
        </span>
      )}
    </li>
  );
}

function StaffTable({ rows }: { rows: KpiStaffRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
            <th className="whitespace-nowrap px-5 py-2 font-medium">担当者</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">担当（有料）</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">返信/日</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">1件の中央値</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">対応時間/日</th>
            <th className="whitespace-nowrap px-5 py-2 text-right font-medium">計測件数</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => (
            <tr key={r.staffId}>
              <td className="whitespace-nowrap px-5 py-2.5 text-stone-800">
                {r.name}
                {r.role === "admin" && (
                  <span className="ml-2 rounded bg-terracotta/10 px-1.5 py-0.5 text-[11px] font-bold text-terracotta">
                    運営
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.assignedPaying}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {Math.round(r.repliesPerDay * 10) / 10}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatKpiValue("seconds", r.handlingMedianSeconds)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatKpiValue("hours", r.handlingHoursPerDay)}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-stone-400">
                {r.handlingSamples}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KpiBoard({ snapshot }: { snapshot: KpiSnapshot }) {
  const tiers: KpiTier[] = ["p0", "p1", "p2"];
  return (
    <div className="space-y-8">
      {snapshot.warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {snapshot.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {tiers.map((tier) => (
        <section key={tier}>
          <div className="mb-2 flex items-baseline gap-3">
            <h2 className="text-base font-bold text-stone-900">{TIER_TITLE[tier].title}</h2>
            <span className="text-xs text-stone-400">{TIER_TITLE[tier].sub}</span>
          </div>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {snapshot.metrics
              .filter((m) => m.tier === tier)
              .map((m) => (
                <MetricRow key={m.key} m={m} />
              ))}
          </ul>
          {tier === "p1" && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-white">
              <StaffTable rows={snapshot.staff} />
            </div>
          )}
          {tier === "p2" && snapshot.cancelReasons.length > 0 && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-white px-5 py-3">
              <p className="text-xs font-medium text-stone-500">解約理由（30日）</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
                {snapshot.cancelReasons.map((r) => (
                  <li key={r.code} className="tabular-nums">
                    {r.code} <span className="text-stone-400">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
