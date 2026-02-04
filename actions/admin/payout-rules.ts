"use server";

import { revalidatePath } from "next/cache";
import { payoutRuleSchema } from "@/schemas/payout";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// =====================================
// 配分ルール一覧取得
// =====================================

export type PayoutRule = {
  id: string;
  ruleType: string;
  scopeType: "global" | "cast";
  castId: string | null;
  castName: string | null;
  percent: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
};

export type GetPayoutRulesResult = Result<{ items: PayoutRule[] }>;

/**
 * 配分ルール一覧取得
 */
export async function getPayoutRules(): Promise<GetPayoutRulesResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("payout_rules")
    .select(`
      id,
      rule_type,
      scope_type,
      cast_id,
      percent,
      effective_from,
      effective_to,
      active,
      staff_profiles!payout_rules_cast_id_fkey (
        display_name
      )
    `)
    .order("scope_type", { ascending: true })
    .order("effective_from", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: PayoutRule[] = (data ?? []).map((row) => ({
    id: row.id,
    ruleType: row.rule_type,
    scopeType: row.scope_type as "global" | "cast",
    castId: row.cast_id,
    castName: (row.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
    percent: row.percent,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    active: row.active,
  }));

  return { ok: true, data: { items } };
}

// =====================================
// 配分ルール作成/更新
// =====================================

export type UpsertPayoutRuleInput = {
  ruleType: "gift_share";
  scopeType: "global" | "cast";
  castId?: string;
  percent: number;
  effectiveFrom: string;
  active: boolean;
};

export type UpsertPayoutRuleResult = Result<{ id: string }>;

/**
 * 配分ルール作成/更新
 */
export async function upsertPayoutRule(
  input: UpsertPayoutRuleInput
): Promise<UpsertPayoutRuleResult> {
  const parsed = payoutRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // scopeType=globalの場合、cast_idはnull
  // scopeType=castでもcastIdが未定義の場合はnullを使用
  const castId = parsed.data.scopeType === "cast" ? (parsed.data.castId ?? null) : null;

  const { data, error } = await supabase
    .from("payout_rules")
    .insert({
      rule_type: parsed.data.ruleType,
      scope_type: parsed.data.scopeType,
      cast_id: castId,
      percent: parsed.data.percent,
      effective_from: parsed.data.effectiveFrom,
      active: parsed.data.active,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ルールの保存に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "UPSERT_PAYOUT_RULE",
    targetType: "payout_rules",
    targetId: data.id,
    success: true,
    metadata: buildAuditMetadata(parsed.data),
  });

  revalidatePath("/admin/payout-rules");

  return { ok: true, data: { id: data.id } };
}

// =====================================
// 配分ルール無効化
// =====================================

export type DeactivatePayoutRuleInput = {
  ruleId: string;
};

export type DeactivatePayoutRuleResult = Result<{ id: string }>;

/**
 * 配分ルール無効化
 */
export async function deactivatePayoutRule(
  input: DeactivatePayoutRuleInput
): Promise<DeactivatePayoutRuleResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("payout_rules")
    .update({ active: false })
    .eq("id", input.ruleId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ルールの無効化に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "DEACTIVATE_PAYOUT_RULE",
    targetType: "payout_rules",
    targetId: input.ruleId,
    success: true,
    metadata: {},
  });

  revalidatePath("/admin/payout-rules");

  return { ok: true, data: { id: input.ruleId } };
}
