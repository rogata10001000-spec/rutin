"use server";

import { Result } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";

export type FunnelEventCounts = {
  lineFollow: number;
  trialStart: number;
  subscribe: number;
  planChange: number;
  cancelScheduled: number;
  cancel: number;
  resume: number;
};

export type FunnelAnalytics = {
  periodDays: number;
  events: FunnelEventCounts;
  statusCounts: Record<string, number>;
  cancelReasons: { code: string; label: string; count: number }[];
  rates: {
    followToTrial: number | null; // 友だち追加→トライアル開始（%）
    trialToPaid: number | null; // トライアル開始→課金転換（概算・%）
  };
};

const ALLOWED_DAYS = [7, 30, 90] as const;

const REASON_LABELS: Record<string, string> = {
  price: "料金が高い",
  no_effect: "効果を実感できなかった",
  no_time: "時間が取れなかった",
  cast_mismatch: "担当メイトと合わなかった",
  dissatisfied: "サービスに不満",
  other: "その他",
  unknown: "未回答",
};

export async function getFunnelAnalytics(input?: {
  days?: number;
}): Promise<Result<FunnelAnalytics>> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "権限がありません" } };
  }

  const requestedDays = input?.days ?? 30;
  const days = ALLOWED_DAYS.includes(requestedDays as (typeof ALLOWED_DAYS)[number])
    ? requestedDays
    : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const supabase = await createServerSupabaseClient();

  const { data: events, error } = await supabase
    .from("subscription_lifecycle_events")
    .select("event_type, metadata")
    .gte("occurred_at", since);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "データの取得に失敗しました" } };
  }

  const counts: FunnelEventCounts = {
    lineFollow: 0,
    trialStart: 0,
    subscribe: 0,
    planChange: 0,
    cancelScheduled: 0,
    cancel: 0,
    resume: 0,
  };
  const reasonTally = new Map<string, number>();

  for (const e of events ?? []) {
    switch (e.event_type) {
      case "line_follow":
        counts.lineFollow += 1;
        break;
      case "trial_start":
        counts.trialStart += 1;
        break;
      case "subscribe":
        counts.subscribe += 1;
        break;
      case "plan_change":
        counts.planChange += 1;
        break;
      case "cancel_scheduled": {
        counts.cancelScheduled += 1;
        const code =
          typeof e.metadata?.cancel_reason_code === "string"
            ? (e.metadata.cancel_reason_code as string)
            : "unknown";
        reasonTally.set(code, (reasonTally.get(code) ?? 0) + 1);
        break;
      }
      case "cancel":
        counts.cancel += 1;
        break;
      case "resume":
        counts.resume += 1;
        break;
    }
  }

  const { data: statusRows } = await supabase.from("end_users").select("status");
  const statusCounts: Record<string, number> = {};
  for (const r of statusRows ?? []) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  const cancelReasons = [...reasonTally.entries()]
    .map(([code, count]) => ({ code, label: REASON_LABELS[code] ?? code, count }))
    .sort((a, b) => b.count - a.count);

  const pct = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return {
    ok: true,
    data: {
      periodDays: days,
      events: counts,
      statusCounts,
      cancelReasons,
      rates: {
        followToTrial: pct(counts.trialStart, counts.lineFollow),
        trialToPaid: pct(counts.subscribe, counts.trialStart),
      },
    },
  };
}

// =====================================================
// 日次トレンド（daily_metrics ロールアップから取得・E3）
// =====================================================
export type DailyTrendPoint = {
  date: string;
  subscribe: number;
  cancel: number;
  trialStart: number;
  revenue: number;
  activeUsers: number;
};

export type DailyTrendResult = Result<{ points: DailyTrendPoint[] }>;

const TREND_ALLOWED_DAYS = [7, 30, 90] as const;

export async function getDailyTrend(input?: { days?: number }): Promise<DailyTrendResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "権限がありません" } };
  }

  const requested = input?.days ?? 30;
  const days = TREND_ALLOWED_DAYS.includes(requested as (typeof TREND_ALLOWED_DAYS)[number])
    ? requested
    : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("metric_date, subscribe, cancel, trial_start, revenue_incl_tax_jpy, active_users")
    .gte("metric_date", since)
    .order("metric_date", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "データの取得に失敗しました" } };
  }

  return {
    ok: true,
    data: {
      points: (data ?? []).map((r) => ({
        date: r.metric_date,
        subscribe: r.subscribe,
        cancel: r.cancel,
        trialStart: r.trial_start,
        revenue: r.revenue_incl_tax_jpy,
        activeUsers: r.active_users,
      })),
    },
  };
}
