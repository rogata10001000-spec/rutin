import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";

const LIFECYCLE_COLUMNS = [
  "line_follow",
  "trial_start",
  "subscribe",
  "plan_change",
  "cancel_scheduled",
  "cancel",
  "resume",
] as const;

type LifecycleKey = (typeof LIFECYCLE_COLUMNS)[number];

/** JSTの「昨日」の YYYY-MM-DD を返す */
export function jstYesterday(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 指定日（JST, YYYY-MM-DD）の日次メトリクスを集計し daily_metrics に upsert する（冪等）。
 * - イベント数: subscription_lifecycle_events（その日のJST範囲）
 * - 売上: revenue_events（occurred_on = 当日）
 * - active_users: 実行時点のサービス提供中ユーザー数（スナップショット）
 */
export async function runDailyMetricsRollup(
  targetDate: string = jstYesterday()
): Promise<{ date: string }> {
  const supabase = createAdminSupabaseClient();

  const dayStart = `${targetDate}T00:00:00+09:00`;
  const next = new Date(new Date(`${targetDate}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000);
  const dayEnd = next.toISOString();

  const { data: events } = await supabase
    .from("subscription_lifecycle_events")
    .select("event_type")
    .gte("occurred_at", dayStart)
    .lt("occurred_at", dayEnd);

  const counts: Record<LifecycleKey, number> = {
    line_follow: 0,
    trial_start: 0,
    subscribe: 0,
    plan_change: 0,
    cancel_scheduled: 0,
    cancel: 0,
    resume: 0,
  };
  for (const e of events ?? []) {
    if ((LIFECYCLE_COLUMNS as readonly string[]).includes(e.event_type)) {
      counts[e.event_type as LifecycleKey] += 1;
    }
  }

  const { data: revenueRows } = await supabase
    .from("revenue_events")
    .select("amount_incl_tax_jpy")
    .eq("occurred_on", targetDate);
  const revenue = (revenueRows ?? []).reduce((s, r) => s + (r.amount_incl_tax_jpy ?? 0), 0);

  const { count: activeCount } = await supabase
    .from("end_users")
    .select("*", { count: "exact", head: true })
    .in("status", ["trial", "active", "past_due"]);

  await supabase.from("daily_metrics").upsert(
    {
      metric_date: targetDate,
      ...counts,
      revenue_incl_tax_jpy: revenue,
      active_users: activeCount ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "metric_date" }
  );

  return { date: targetDate };
}
