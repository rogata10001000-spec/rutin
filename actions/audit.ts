"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "./types";

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorStaffId: string | null;
  actorStaffName: string | null;
  success: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type GetAuditLogsInput = {
  action?: string;
  targetType?: string;
  limit?: number;
  cursor?: string;
};

export type GetAuditLogsResult = Result<{
  items: AuditLogEntry[];
  nextCursor: string | null;
}>;

/**
 * 絞り込みドロップダウンの候補を導出するときにスキャンする行数の上限。
 *
 * audit_logs は運用に比例して無限に増えるテーブルで、DISTINCT を取るためだけの
 * 全件 SELECT は行数の増加とともに監査画面の表示を確実に遅くしていく。
 * 実際に使われている種別は直近のログにほぼ出揃うため、
 * 「新しい順に一定件数だけ」を見て JS 側で重複排除する（走査量を一定に保つ）。
 *
 * ※ AuditAction は lib/audit.ts に型として定義されているが実行時の値を持たないため、
 *   ここから列挙することはできない（型の二重定義を避けるためハードコードもしない）。
 */
const FILTER_OPTION_SCAN_LIMIT = 1000;

/**
 * 監査ログ一覧取得
 */
export async function getAuditLogs(
  input: GetAuditLogsInput = {}
): Promise<GetAuditLogsResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const limit = input.limit ?? 50;

  let query = supabase
    .from("audit_logs")
    .select(`
      id,
      action,
      target_type,
      target_id,
      actor_staff_id,
      success,
      metadata,
      created_at,
      staff_profiles!audit_logs_actor_staff_id_fkey (
        display_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (input.action) {
    query = query.eq("action", input.action);
  }
  if (input.targetType) {
    query = query.eq("target_type", input.targetType);
  }
  if (input.cursor) {
    query = query.lt("created_at", input.cursor);
  }

  const { data, error } = await query;

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const hasMore = (data?.length ?? 0) > limit;
  const items: AuditLogEntry[] = (data ?? []).slice(0, limit).map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    actorStaffId: row.actor_staff_id,
    actorStaffName:
      (row.staff_profiles as unknown as { display_name: string } | null)?.display_name ??
      null,
    success: row.success,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  const nextCursor = hasMore ? data?.[limit]?.created_at ?? null : null;

  return { ok: true, data: { items, nextCursor } };
}

/**
 * アクション種別一覧取得
 */
export async function getAuditActions(): Promise<Result<{ actions: string[] }>> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 直近ぶんだけを走査して重複排除（並び順は従来どおり名前の昇順）
  const { data } = await supabase
    .from("audit_logs")
    .select("action")
    .order("created_at", { ascending: false })
    .limit(FILTER_OPTION_SCAN_LIMIT);

  const actions = [...new Set((data ?? []).map((r) => r.action))].sort();

  return { ok: true, data: { actions } };
}

/**
 * 対象種別一覧取得
 */
export async function getAuditTargetTypes(): Promise<Result<{ targetTypes: string[] }>> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 直近ぶんだけを走査して重複排除（並び順は従来どおり名前の昇順）
  const { data } = await supabase
    .from("audit_logs")
    .select("target_type")
    .order("created_at", { ascending: false })
    .limit(FILTER_OPTION_SCAN_LIMIT);

  const targetTypes = [...new Set((data ?? []).map((r) => r.target_type))].sort();

  return { ok: true, data: { targetTypes } };
}
