"use server";

import { requireAdminOrSupervisor } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { buildKpiSnapshot, type KpiSnapshot } from "@/lib/kpi-metrics";
import { logger } from "@/lib/logger";
import type { Result } from "@/actions/types";

export type { KpiSnapshot, KpiMetric, KpiStaffRow } from "@/lib/kpi-metrics";

/**
 * 検証指標（KPI）のスナップショット。
 * 権限: admin / supervisor。判定・目標は lib/kpi-targets.ts（日次通知と共有）。
 */
export async function getKpiSnapshot(): Promise<Result<KpiSnapshot>> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者またはスーパーバイザーの権限が必要です" } };
  }
  try {
    const snapshot = await buildKpiSnapshot(createAdminSupabaseClient());
    return { ok: true, data: snapshot };
  } catch (err) {
    logger.error("kpi: snapshot failed", { error: err instanceof Error ? err.message : "unknown" });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "指標を集計できませんでした。時間をおいて再読み込みしてください" },
    };
  }
}
