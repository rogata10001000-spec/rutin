"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "../types";
import { upsertPlanPriceSchema, type UpsertPlanPriceInput } from "@/schemas/plan-prices";
import { writeAuditLog } from "@/lib/audit";

export type PlanPrice = {
  id: string;
  planCode: string;
  planName: string;
  currency: string;
  amountMonthly: number;
  stripePriceId: string;
  validFrom: string;
  active: boolean;
  createdAt: string;
};

export type GetPlanPricesResult = Result<{ items: PlanPrice[] }>;

const PLAN_NAMES: Record<string, string> = {
  light: "ライト",
  standard: "スタンダード",
  premium: "プレミアム",
};

/**
 * デフォルトプラン価格一覧取得
 */
export async function getPlanPrices(): Promise<GetPlanPricesResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: prices, error } = await supabase
    .from("plan_prices")
    .select("id, plan_code, currency, amount_monthly, stripe_price_id, valid_from, active, created_at")
    .order("plan_code")
    .order("valid_from", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: PlanPrice[] = (prices ?? []).map((p) => ({
    id: p.id,
    planCode: p.plan_code,
    planName: PLAN_NAMES[p.plan_code] ?? p.plan_code,
    currency: p.currency,
    amountMonthly: p.amount_monthly,
    stripePriceId: p.stripe_price_id,
    validFrom: p.valid_from,
    active: p.active,
    createdAt: p.created_at,
  }));

  return { ok: true, data: { items } };
}

export type UpsertPlanPriceResult = Result<{ id: string }>;

/**
 * デフォルトプラン価格作成/更新
 */
export async function upsertPlanPrice(
  input: UpsertPlanPriceInput
): Promise<UpsertPlanPriceResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const parsed = upsertPlanPriceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.errors[0]?.message ?? "入力内容を確認してください" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { id, planCode, stripePriceId, amountMonthly, validFrom, active } = parsed.data;

  let resultId: string;
  let action: "PLAN_PRICE_CREATE" | "PLAN_PRICE_UPDATE";

  if (id) {
    // 更新
    const { data, error } = await supabase
      .from("plan_prices")
      .update({
        stripe_price_id: stripePriceId,
        amount_monthly: amountMonthly,
        valid_from: validFrom,
        active,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "更新に失敗しました" },
      };
    }

    resultId = data.id;
    action = "PLAN_PRICE_UPDATE";
  } else {
    // 新規作成
    const { data, error } = await supabase
      .from("plan_prices")
      .insert({
        plan_code: planCode,
        stripe_price_id: stripePriceId,
        amount_monthly: amountMonthly,
        valid_from: validFrom,
        active,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: { code: "CONFLICT", message: "同じプラン・開始日の価格が既に存在します" },
        };
      }
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "作成に失敗しました" },
      };
    }

    resultId = data.id;
    action = "PLAN_PRICE_CREATE";
  }

  // 監査ログ
  await writeAuditLog({
    action,
    targetType: "plan_prices",
    targetId: resultId,
    success: true,
    metadata: {
      plan_code: planCode,
      amount_monthly: amountMonthly,
      valid_from: validFrom,
      active,
    },
  });

  return { ok: true, data: { id: resultId } };
}

export type TogglePlanPriceActiveResult = Result<{ id: string }>;

/**
 * プラン価格の有効/無効切り替え
 */
export async function togglePlanPriceActive(
  id: string
): Promise<TogglePlanPriceActiveResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 現在の状態を取得
  const { data: current, error: fetchError } = await supabase
    .from("plan_prices")
    .select("active")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "プラン価格が見つかりません" },
    };
  }

  // 反転
  const { error } = await supabase
    .from("plan_prices")
    .update({ active: !current.active })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "PLAN_PRICE_UPDATE",
    targetType: "plan_prices",
    targetId: id,
    success: true,
    metadata: {
      active: !current.active,
    },
  });

  return { ok: true, data: { id } };
}
