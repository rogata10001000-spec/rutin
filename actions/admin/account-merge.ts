"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { Result } from "../types";
import type { SubscriptionStatus } from "@/lib/supabase/types";

export type EndUserSummary = {
  id: string;
  nickname: string;
  lineUserId: string | null;
  email: string | null;
  status: SubscriptionStatus;
  createdAt: string;
};

export type SearchEndUsersResult = Result<{ items: EndUserSummary[] }>;

/**
 * 統合対象の候補を検索する（管理者専用）。
 * email / line_user_id / id の部分一致で検索。
 */
export async function searchEndUsers(query: string): Promise<SearchEndUsersResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  const q = query.trim();
  if (q.length < 2) {
    return { ok: true, data: { items: [] } };
  }

  const supabase = createAdminSupabaseClient();
  // PostgREST の or フィルタ構文を壊す文字（, ( ) 等）を除去し、LIKE のワイルドカードをエスケープ
  const sanitized = q.replace(/[(),*\\]/g, " ").trim();
  const escaped = sanitized.replace(/[%_]/g, (m) => `\\${m}`);
  if (!escaped) {
    return { ok: true, data: { items: [] } };
  }

  const { data, error } = await supabase
    .from("end_users")
    .select("id, nickname, line_user_id, email, status, created_at")
    .or(`nickname.ilike.%${escaped}%,email.ilike.%${escaped}%,line_user_id.ilike.%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "検索に失敗しました" } };
  }

  const items: EndUserSummary[] = (data ?? []).map((u) => ({
    id: u.id,
    nickname: u.nickname,
    lineUserId: u.line_user_id,
    email: u.email,
    status: u.status as SubscriptionStatus,
    createdAt: u.created_at,
  }));

  return { ok: true, data: { items } };
}

export type MergeEndUsersResult = Result<{ targetId: string }>;

/**
 * 重複した end_user を統合する（管理者専用・不可逆）。
 * source の子レコードを target に付け替え、source を削除する。
 */
export async function mergeEndUsers(input: {
  sourceId: string;
  targetId: string;
}): Promise<MergeEndUsersResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  const { sourceId, targetId } = input;
  if (!sourceId || !targetId) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "統合元と統合先を指定してください" } };
  }
  if (sourceId === targetId) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "統合元と統合先が同一です" } };
  }

  const supabase = createAdminSupabaseClient();

  // 存在確認
  const { data: rows } = await supabase
    .from("end_users")
    .select("id")
    .in("id", [sourceId, targetId]);
  if (!rows || rows.length !== 2) {
    return { ok: false, error: { code: "NOT_FOUND", message: "対象のユーザーが見つかりません" } };
  }

  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  }).rpc("merge_end_users", { p_source: sourceId, p_target: targetId });

  if (error) {
    await writeAuditLog({
      action: "END_USER_MERGE",
      targetType: "end_users",
      targetId,
      success: false,
      metadata: { source_id: sourceId, target_id: targetId, error: error.message },
      actorStaffId: auth.id,
    });
    return { ok: false, error: { code: "UNKNOWN", message: `統合に失敗しました: ${error.message}` } };
  }

  await writeAuditLog({
    action: "END_USER_MERGE",
    targetType: "end_users",
    targetId,
    success: true,
    metadata: { source_id: sourceId, target_id: targetId },
    actorStaffId: auth.id,
  });

  return { ok: true, data: { targetId } };
}
