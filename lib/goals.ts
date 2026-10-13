import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  defaultReviewAt,
  jstDateOf,
  type ActiveGoal,
  type GoalCategory,
} from "@/lib/goal-defs";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;
// RLS クライアント（スタッフ）でも同じ関数を使えるよう、from/select だけに依存する最小の型にする
type AnyClient = Pick<SupabaseAdmin, "from">;

const GOAL_COLUMNS = "id, end_user_id, category, title, weekly_target, started_at, review_at, status";

type GoalRow = {
  id: string;
  end_user_id: string;
  category: GoalCategory;
  title: string;
  weekly_target: number | null;
  started_at: string;
  review_at: string;
  status: ActiveGoal["status"];
};

function toGoal(row: GoalRow): ActiveGoal {
  return {
    id: row.id,
    endUserId: row.end_user_id,
    category: row.category,
    title: row.title,
    weeklyTarget: row.weekly_target,
    startedAt: row.started_at,
    reviewAt: row.review_at,
    status: row.status,
  };
}

/**
 * 進行中の目標。テーブル未適用・取得失敗は null（画面は「未登録」でなく欄を出さない側に倒す）。
 * 失敗を「未登録」と断定しないよう、呼び出し側は `available` も見る。
 */
export async function getActiveGoal(
  supabase: AnyClient,
  endUserId: string
): Promise<{ goal: ActiveGoal | null; available: boolean }> {
  const { data, error } = await supabase
    .from("end_user_goals")
    .select(GOAL_COLUMNS)
    .eq("end_user_id", endUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logger.warn("goals: fetch failed", { endUserId, error: error.message });
    return { goal: null, available: false };
  }
  return { goal: data ? toGoal(data as GoalRow) : null, available: true };
}

/** 目標テーブルが使えるか（マイグレーション未適用の環境でフォームを出さないための判定） */
export async function goalsAvailable(supabase: AnyClient): Promise<boolean> {
  const { error } = await supabase.from("end_user_goals").select("id").limit(1);
  return !error;
}

export type SaveGoalInput = {
  endUserId: string;
  category: GoalCategory;
  title: string;
  weeklyTarget: number | null;
  createdByStaffId?: string | null;
};

/**
 * 進行中の目標を保存する。既に active があればその内容を更新（開始日は維持）、無ければ新規。
 * 「次の目標」（旧目標を達成/置換して新しく始める）は replaceActiveGoal を使う。
 */
export async function saveActiveGoal(
  supabase: AnyClient,
  input: SaveGoalInput
): Promise<{ ok: true; goal: ActiveGoal; created: boolean } | { ok: false; message: string }> {
  const existing = await getActiveGoal(supabase, input.endUserId);
  if (!existing.available) return { ok: false, message: "目標を保存できませんでした" };

  if (existing.goal) {
    const { data, error } = await supabase
      .from("end_user_goals")
      .update({ category: input.category, title: input.title, weekly_target: input.weeklyTarget })
      .eq("id", existing.goal.id)
      .eq("status", "active")
      .select(GOAL_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      logger.warn("goals: update failed", { endUserId: input.endUserId, error: error?.message });
      return { ok: false, message: "目標を保存できませんでした" };
    }
    return { ok: true, goal: toGoal(data as GoalRow), created: false };
  }

  const startedAt = jstDateOf(new Date());
  const { data, error } = await supabase
    .from("end_user_goals")
    .insert({
      end_user_id: input.endUserId,
      category: input.category,
      title: input.title,
      weekly_target: input.weeklyTarget,
      started_at: startedAt,
      review_at: defaultReviewAt(startedAt),
      created_by_staff_id: input.createdByStaffId ?? null,
    })
    .select(GOAL_COLUMNS)
    .single();
  if (error || !data) {
    // 23505 = 同時保存で先に active ができた → 取り直して返す
    if (error?.code === "23505") {
      const again = await getActiveGoal(supabase, input.endUserId);
      if (again.goal) return { ok: true, goal: again.goal, created: false };
    }
    logger.warn("goals: insert failed", { endUserId: input.endUserId, error: error?.message });
    return { ok: false, message: "目標を保存できませんでした" };
  }
  return { ok: true, goal: toGoal(data as GoalRow), created: true };
}

/**
 * 次の目標へ: 現在の active を achieved（達成）または replaced にしてから新規を作る。
 * 新規 insert が失敗したら旧目標を active に戻す（目標が消えた状態を残さない）。
 */
export async function replaceActiveGoal(
  supabase: AnyClient,
  input: SaveGoalInput & { previousOutcome: "achieved" | "replaced" }
): Promise<{ ok: true; goal: ActiveGoal } | { ok: false; message: string }> {
  const existing = await getActiveGoal(supabase, input.endUserId);
  if (!existing.available) return { ok: false, message: "目標を保存できませんでした" };

  if (existing.goal) {
    const { error: closeError } = await supabase
      .from("end_user_goals")
      .update({
        status: input.previousOutcome,
        achieved_at: input.previousOutcome === "achieved" ? new Date().toISOString() : null,
      })
      .eq("id", existing.goal.id)
      .eq("status", "active");
    if (closeError) return { ok: false, message: "目標を保存できませんでした" };
  }

  const startedAt = jstDateOf(new Date());
  const { data, error } = await supabase
    .from("end_user_goals")
    .insert({
      end_user_id: input.endUserId,
      category: input.category,
      title: input.title,
      weekly_target: input.weeklyTarget,
      started_at: startedAt,
      review_at: defaultReviewAt(startedAt),
      created_by_staff_id: input.createdByStaffId ?? null,
    })
    .select(GOAL_COLUMNS)
    .single();
  if (error || !data) {
    if (existing.goal) {
      // 巻き戻し: 旧目標を active に戻す
      await supabase
        .from("end_user_goals")
        .update({ status: "active", achieved_at: null })
        .eq("id", existing.goal.id);
    }
    logger.warn("goals: replace failed", { endUserId: input.endUserId, error: error?.message });
    return { ok: false, message: "目標を保存できませんでした" };
  }
  return { ok: true, goal: toGoal(data as GoalRow) };
}
