"use server";

import { revalidatePath } from "next/cache";
import { canAccessUser } from "@/lib/auth";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { retrieveCheckoutSession } from "@/lib/stripe";
import { getRelationshipsByLineUserId } from "@/lib/person";
import { saveActiveGoal, replaceActiveGoal } from "@/lib/goals";
import { validateGoalInput, type ActiveGoal } from "@/lib/goal-defs";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { Result } from "@/actions/types";

export type GoalInput = {
  category: string;
  title: string;
  weeklyTarget: number | null;
};

/**
 * 申込完了画面からの目標登録。
 * ログインCookie（30分で失効）に依存せず、Stripe の Checkout Session ID を本人性の根拠にする
 * （推測不能なIDで、支払い済みのセッションからだけ metadata の LINE UID が取れる）。
 */
export async function saveGoalFromCheckout(input: {
  sessionId: string;
  goal: GoalInput;
}): Promise<Result<ActiveGoal>> {
  const v = validateGoalInput(input.goal);
  if (v.ok === false) return { ok: false, error: { code: "ZOD_ERROR", message: v.message } };
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(input.sessionId)) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "セッションが不正です" } };
  }

  let lineUserId: string | null = null;
  let castId: string | null = null;
  try {
    const session = await retrieveCheckoutSession(input.sessionId);
    const paid = session.mode === "subscription" && session.payment_status !== "unpaid";
    if (!paid) {
      return { ok: false, error: { code: "FORBIDDEN", message: "契約を確認できませんでした" } };
    }
    lineUserId = session.metadata?.line_user_id ?? null;
    castId = session.metadata?.cast_id ?? null;
  } catch (err) {
    logger.warn("goals: checkout session lookup failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "契約の確認に失敗しました。時間をおいてもう一度お試しください" },
    };
  }
  if (!lineUserId) {
    return { ok: false, error: { code: "NOT_FOUND", message: "契約情報が見つかりません" } };
  }

  const admin = createAdminSupabaseClient();
  const rows = await getRelationshipsByLineUserId(admin, lineUserId);
  const row = (castId ? rows.find((r) => r.assignedCastId === castId) : null) ?? (rows.length === 1 ? rows[0] : null);
  if (!row) {
    return { ok: false, error: { code: "NOT_FOUND", message: "契約情報が見つかりません" } };
  }

  const saved = await saveActiveGoal(admin, {
    endUserId: row.endUserId,
    category: v.category,
    title: v.title,
    weeklyTarget: v.weeklyTarget,
  });
  if (saved.ok === false) return { ok: false, error: { code: "UNKNOWN", message: saved.message } };

  await writeAuditLog({
    action: "USER_PROFILE_UPDATE",
    targetType: "end_user_goals",
    targetId: saved.goal.id,
    success: true,
    metadata: { source: "checkout", end_user_id: row.endUserId, created: saved.created },
    actorStaffId: null,
  });
  return { ok: true, data: saved.goal };
}

/** メイト・管理者による目標の登録／編集（担当か管理者のみ） */
export async function saveGoalForUser(input: {
  endUserId: string;
  goal: GoalInput;
}): Promise<Result<ActiveGoal>> {
  const v = validateGoalInput(input.goal);
  if (v.ok === false) return { ok: false, error: { code: "ZOD_ERROR", message: v.message } };
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return { ok: false, error: { code: "FORBIDDEN", message: "このユーザーの目標を編集する権限がありません" } };
  }
  const supabase = await createServerSupabaseClient();
  const saved = await saveActiveGoal(supabase, {
    endUserId: input.endUserId,
    category: v.category,
    title: v.title,
    weeklyTarget: v.weeklyTarget,
    createdByStaffId: access.id,
  });
  if (saved.ok === false) return { ok: false, error: { code: "UNKNOWN", message: saved.message } };
  await writeAuditLog({
    action: "USER_PROFILE_UPDATE",
    targetType: "end_user_goals",
    targetId: saved.goal.id,
    success: true,
    metadata: { source: "staff", end_user_id: input.endUserId, created: saved.created },
  });
  revalidatePath(`/users/${input.endUserId}`);
  return { ok: true, data: saved.goal };
}

/** 次の目標へ（現在の目標を「達成」または「置き換え」にして新しい目標を始める） */
export async function startNextGoalForUser(input: {
  endUserId: string;
  goal: GoalInput;
  previousOutcome: "achieved" | "replaced";
}): Promise<Result<ActiveGoal>> {
  const v = validateGoalInput(input.goal);
  if (v.ok === false) return { ok: false, error: { code: "ZOD_ERROR", message: v.message } };
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return { ok: false, error: { code: "FORBIDDEN", message: "このユーザーの目標を編集する権限がありません" } };
  }
  const supabase = await createServerSupabaseClient();
  const saved = await replaceActiveGoal(supabase, {
    endUserId: input.endUserId,
    category: v.category,
    title: v.title,
    weeklyTarget: v.weeklyTarget,
    createdByStaffId: access.id,
    previousOutcome: input.previousOutcome,
  });
  if (saved.ok === false) return { ok: false, error: { code: "UNKNOWN", message: saved.message } };
  await writeAuditLog({
    action: "USER_PROFILE_UPDATE",
    targetType: "end_user_goals",
    targetId: saved.goal.id,
    success: true,
    metadata: { source: "staff", end_user_id: input.endUserId, next_goal: true, previous: input.previousOutcome },
  });
  revalidatePath(`/users/${input.endUserId}`);
  return { ok: true, data: saved.goal };
}
