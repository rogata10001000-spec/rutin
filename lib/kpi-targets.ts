/**
 * 検証指標（KPI）の目標値と判定。
 *
 * 画面（/admin/kpi・ダッシュボード）と日次通知（daily-summary）が同じ判定を使う。
 * 「画面は赤いのに通知が来ない」型のズレを構造的に防ぐため、目標値はここ以外に書かない。
 * 根拠: docs/SOLO_SCALE_REQUIREMENTS.md §2-2（シナリオC: 自分で130人・手残り100万）。
 */

export type KpiTier = "p0" | "p1" | "p2";
export type KpiUnit = "count" | "jpy" | "percent" | "seconds" | "hours" | "days";
export type KpiDirection = "gte" | "lte";
export type KpiStatus = "achieved" | "warn" | "bad" | "insufficient" | "none";

export type KpiTargetDef = {
  key: string;
  tier: KpiTier;
  label: string;
  unit: KpiUnit;
  /** 目標値。null = 目標なし（参考表示） */
  target: number | null;
  direction: KpiDirection;
  /** 分母がこの数に満たない場合は「データ不足」（通知も出さない） */
  minSample?: number;
  /** 目標から何割以内を「注意」にするか（既定 0.2） */
  warnMargin?: number;
};

export const KPI_TARGETS: KpiTargetDef[] = [
  // ---- P0: 事業が成立するか ----
  { key: "paying_count", tier: "p0", label: "有料契約数", unit: "count", target: null, direction: "gte" },
  { key: "mrr", tier: "p0", label: "MRR（税込）", unit: "jpy", target: null, direction: "gte" },
  { key: "arpu", tier: "p0", label: "ARPU", unit: "jpy", target: null, direction: "gte" },
  { key: "gross_margin", tier: "p0", label: "運営粗利（推定・月）", unit: "jpy", target: 1_000_000, direction: "gte" },
  { key: "owner_assigned", tier: "p0", label: "自分の担当（有料）", unit: "count", target: 130, direction: "gte" },
  { key: "trial_conversion", tier: "p0", label: "トライアル→有料 転換率", unit: "percent", target: 0.3, direction: "gte", minSample: 10 },
  { key: "retention_30d", tier: "p0", label: "有料開始後30日の継続率", unit: "percent", target: 0.8, direction: "gte", minSample: 10 },
  { key: "monthly_churn", tier: "p0", label: "月次解約率", unit: "percent", target: 0.08, direction: "lte", minSample: 10 },
  // ---- P1: 1人で回っているか ----
  { key: "handling_median_seconds", tier: "p1", label: "返信1件の実作業時間（中央値）", unit: "seconds", target: 90, direction: "lte", minSample: 10 },
  { key: "replies_per_day", tier: "p1", label: "1日の返信件数（7日平均）", unit: "count", target: null, direction: "gte" },
  { key: "handling_hours_per_day", tier: "p1", label: "1日の総対応時間（7日平均）", unit: "hours", target: 3.5, direction: "lte", minSample: 10 },
  { key: "ai_adoption", tier: "p1", label: "AI下書きの採用率（7日）", unit: "percent", target: 0.7, direction: "gte", minSample: 10 },
  { key: "sla_compliance", tier: "p1", label: "返信SLA遵守率（7日）", unit: "percent", target: 0.95, direction: "gte", minSample: 10 },
  // ---- P2: 価値が出ているか ----
  { key: "first_report_rate", tier: "p2", label: "トライアル72時間以内の初回報告率", unit: "percent", target: 0.8, direction: "gte", minSample: 5 },
  { key: "report_days_per_week", tier: "p2", label: "週あたりの報告日数（有料）", unit: "days", target: 4, direction: "gte", minSample: 5 },
  { key: "checkin_circle_rate", tier: "p2", label: "チェックインの達成（◯）割合（30日）", unit: "percent", target: 0.5, direction: "gte", minSample: 20 },
];

export const KPI_TARGET_BY_KEY: Record<string, KpiTargetDef> = Object.fromEntries(
  KPI_TARGETS.map((t) => [t.key, t])
);

/** 運営粗利の推定に使う前提（docs/SOLO_SCALE_REQUIREMENTS.md §0） */
export const KPI_COST_ASSUMPTIONS = {
  /** Stripe Payments 3.6% + Billing 0.7% */
  stripeFeeRate: 0.043,
  /** LINE 追加メッセージ 3円/通（2026-10改定） */
  linePerMessageJpy: 3,
  /** 1利用者あたり月の push 通数（毎日1返信＋催促） */
  assumedMessagesPerUserPerMonth: 30,
  /** 消費税率（MRR は税込表示のため粗利は税抜で見る） */
  taxRate: 0.1,
} as const;

/**
 * 値と目標から状態を判定する。
 * - target が null → "none"（参考表示）
 * - value が null、または分母が minSample 未満 → "insufficient"
 * - 目標達成 → "achieved"、目標から warnMargin 以内 → "warn"、それ以外 → "bad"
 */
export function evaluateKpi(
  def: KpiTargetDef,
  value: number | null,
  sampleSize?: number | null
): KpiStatus {
  if (def.target === null) return "none";
  if (value === null || Number.isNaN(value)) return "insufficient";
  if (def.minSample !== undefined && (sampleSize ?? 0) < def.minSample) return "insufficient";
  const margin = def.warnMargin ?? 0.2;
  if (def.direction === "gte") {
    if (value >= def.target) return "achieved";
    return value >= def.target * (1 - margin) ? "warn" : "bad";
  }
  if (value <= def.target) return "achieved";
  return value <= def.target * (1 + margin) ? "warn" : "bad";
}

export function formatKpiValue(unit: KpiUnit, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (unit) {
    case "jpy":
      return `¥${Math.round(value).toLocaleString("ja-JP")}`;
    case "percent":
      return `${Math.round(value * 1000) / 10}%`;
    case "seconds":
      return value >= 120 ? `${Math.round(value / 6) / 10}分` : `${Math.round(value)}秒`;
    case "hours":
      return `${Math.round(value * 10) / 10}時間`;
    case "days":
      return `${Math.round(value * 10) / 10}日`;
    default:
      return Math.round(value).toLocaleString("ja-JP");
  }
}

export function formatKpiTarget(def: KpiTargetDef): string {
  if (def.target === null) return "";
  const v = formatKpiValue(def.unit, def.target);
  return def.direction === "gte" ? `${v}以上` : `${v}以下`;
}
