"use server";

import { revalidatePath } from "next/cache";
import { updatePlanSettingsSchema } from "@/schemas/plans";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// =====================================
// プラン一覧取得
// =====================================

export type PlanAdmin = {
  planCode: string;
  name: string;
  replySlaMinutes: number;
  slaWarningMinutes: number;
  dailyCheckinEnabled: boolean;
  weeklyReviewEnabled: boolean;
  priorityLevel: number;
  capacityWeight: number;
  active: boolean;
};

export type GetPlansAdminResult = Result<{ items: PlanAdmin[] }>;

/**
 * プラン一覧取得（管理用）
 */
export async function getPlansAdmin(): Promise<GetPlansAdminResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("priority_level", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((row) => ({
        planCode: row.plan_code,
        name: row.name,
        replySlaMinutes: row.reply_sla_minutes,
        slaWarningMinutes: row.sla_warning_minutes,
        dailyCheckinEnabled: row.daily_checkin_enabled,
        weeklyReviewEnabled: row.weekly_review_enabled,
        priorityLevel: row.priority_level,
        capacityWeight: row.capacity_weight,
        active: row.active,
      })),
    },
  };
}

// =====================================
// プラン設定更新
// =====================================

export type UpdatePlanSettingsInput = {
  planCode: "light" | "standard" | "premium";
  replySlaMinutes: number;
  slaWarningMinutes: number;
};

export type UpdatePlanSettingsResult = Result<{ planCode: string }>;

/**
 * プラン設定（SLA時間のみ）を更新
 */
export async function updatePlanSettings(
  input: UpdatePlanSettingsInput
): Promise<UpdatePlanSettingsResult> {
  // Zodバリデーション
  const parsed = updatePlanSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // Admin権限チェック
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const data = parsed.data;

  // 更新前の値を取得（監査用）
  const { data: before } = await supabase
    .from("plans")
    .select("reply_sla_minutes, sla_warning_minutes")
    .eq("plan_code", data.planCode)
    .single();

  // 更新
  const { error } = await supabase
    .from("plans")
    .update({
      reply_sla_minutes: data.replySlaMinutes,
      sla_warning_minutes: data.slaWarningMinutes,
    })
    .eq("plan_code", data.planCode);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  // 監査ログ記録
  await writeAuditLog({
    action: "PLAN_SETTINGS_UPDATE",
    targetType: "plans",
    targetId: data.planCode,
    success: true,
    metadata: buildAuditMetadata({
      before: {
        reply_sla_minutes: before?.reply_sla_minutes,
        sla_warning_minutes: before?.sla_warning_minutes,
      },
      after: {
        reply_sla_minutes: data.replySlaMinutes,
        sla_warning_minutes: data.slaWarningMinutes,
      },
    }),
  });

  revalidatePath("/admin/plans");

  return { ok: true, data: { planCode: data.planCode } };
}
