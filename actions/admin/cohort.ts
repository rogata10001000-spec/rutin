"use server";

import { Result } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";

export type CohortRow = {
  cohortMonth: string; // YYYY-MM
  users: number;
  // 各オフセット月の継続率(%)。未来で測定不能な場合は null
  retention: (number | null)[];
  cumulativeRevenue: number;
};

export type CohortAnalytics = {
  offsets: number[]; // [0,1,2,...]
  cohorts: CohortRow[];
};

const MAX_OFFSET = 5; // M0..M5
const MAX_COHORTS = 12;

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function monthIndex(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

export async function getCohortAnalysis(): Promise<Result<CohortAnalytics>> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "権限がありません" } };
  }

  const supabase = await createServerSupabaseClient();

  // 契約したことのあるユーザー（未契約=incompleteは除外）
  const { data: users, error } = await supabase
    .from("end_users")
    .select("id, trial_started_at, subscribed_at, canceled_at")
    .neq("status", "incomplete");

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "データの取得に失敗しました" } };
  }

  const nowIdx = monthIndex(new Date().toISOString().slice(0, 7));
  const offsets = Array.from({ length: MAX_OFFSET + 1 }, (_, i) => i);

  // cohortMonth -> { total, retainedAt[offset] }
  type Agg = { total: number; retained: number[] };
  const byCohort = new Map<string, Agg>();

  for (const u of users ?? []) {
    const anchor = u.trial_started_at ?? u.subscribed_at;
    if (!anchor) continue;
    const cohort = monthKey(anchor);
    const cohortIdx = monthIndex(cohort);
    const endIdx = u.canceled_at ? monthIndex(monthKey(u.canceled_at)) : nowIdx;

    const agg = byCohort.get(cohort) ?? { total: 0, retained: offsets.map(() => 0) };
    agg.total += 1;
    for (const off of offsets) {
      // cohort+off が解約月(または現在)以下なら継続中
      if (cohortIdx + off <= endIdx) agg.retained[off] += 1;
    }
    byCohort.set(cohort, agg);
  }

  // 売上はDB側で集計（スケール対応）
  const revenueByCohort = new Map<string, number>();
  const { data: revRows } = await supabase.rpc("get_cohort_revenue");
  for (const r of revRows ?? []) {
    if (r.cohort_month) revenueByCohort.set(r.cohort_month, Number(r.total_incl_tax) || 0);
  }

  const cohorts: CohortRow[] = [...byCohort.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // 新しい月が上
    .slice(0, MAX_COHORTS)
    .map(([cohortMonth, agg]) => {
      const cohortIdx = monthIndex(cohortMonth);
      return {
        cohortMonth,
        users: agg.total,
        retention: offsets.map((off) => {
          if (cohortIdx + off > nowIdx) return null; // 未来＝測定不能
          return agg.total > 0 ? Math.round((agg.retained[off] / agg.total) * 100) : 0;
        }),
        cumulativeRevenue: revenueByCohort.get(cohortMonth) ?? 0,
      };
    });

  return { ok: true, data: { offsets, cohorts } };
}
