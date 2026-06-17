"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin, requireAdminOrSupervisor } from "@/lib/auth";
import { Result, toZodErrorMessage } from "../types";
import { upsertPlanPriceSchema, type UpsertPlanPriceInput } from "@/schemas/plan-prices";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { ensureRecurringPrice } from "@/lib/stripe-pricing";
import type { PlanCode } from "@/lib/supabase/types";

export type PlanPrice = {
  id: string;
  planCode: string;
  planName: string;
  currency: string;
  amountMonthly: number;
  stripePriceId: string;
  amountAnnual: number | null;
  stripePriceIdAnnual: string | null;
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
    .select(
      "id, plan_code, currency, amount_monthly, stripe_price_id, amount_annual, stripe_price_id_annual, valid_from, active, created_at"
    )
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
    amountAnnual: p.amount_annual,
    stripePriceIdAnnual: p.stripe_price_id_annual,
    validFrom: p.valid_from,
    active: p.active,
    createdAt: p.created_at,
  }));

  return { ok: true, data: { items } };
}

export type UpsertPlanPriceResult = Result<{ id: string }>;

/**
 * デフォルトプラン価格作成/更新
 * 金額のみ受け取り、対応する Stripe Price を find-or-create してから保存する。
 * これにより「画面の表示額」と「実際の請求額」が常に一致する。
 */
export async function upsertPlanPrice(
  input: UpsertPlanPriceInput
): Promise<UpsertPlanPriceResult> {
  // 価格はビリングに直結するため admin 限定
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const parsed = upsertPlanPriceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const { planCode, amountMonthly, amountAnnual, active } = parsed.data;

  // Stripe Price を金額から確定（自動作成・冪等）
  let monthlyPriceId: string;
  let annualPriceId: string | null = null;
  try {
    monthlyPriceId = await ensureRecurringPrice(planCode as PlanCode, amountMonthly, "month");
    if (amountAnnual != null) {
      annualPriceId = await ensureRecurringPrice(planCode as PlanCode, amountAnnual, "year");
    }
  } catch (err) {
    await writeAuditLog({
      action: "PLAN_PRICE_UPDATE",
      targetType: "plan_prices",
      targetId: planCode,
      success: false,
      metadata: buildAuditMetadata({
        plan_code: planCode,
        amount_monthly: amountMonthly,
        amount_annual: amountAnnual ?? null,
        error: err instanceof Error ? err.message : "stripe price creation failed",
      }),
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "Stripe価格の作成に失敗しました" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("plan_prices")
    .upsert(
      {
        plan_code: planCode,
        currency: "JPY",
        amount_monthly: amountMonthly,
        stripe_price_id: monthlyPriceId,
        amount_annual: amountAnnual ?? null,
        stripe_price_id_annual: annualPriceId,
        valid_from: today,
        active: active ?? true,
      },
      { onConflict: "plan_code" }
    )
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "保存に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "PLAN_PRICE_UPDATE",
    targetType: "plan_prices",
    targetId: data.id,
    success: true,
    metadata: buildAuditMetadata({
      plan_code: planCode,
      amount_monthly: amountMonthly,
      stripe_price_id: monthlyPriceId,
      amount_annual: amountAnnual ?? null,
      stripe_price_id_annual: annualPriceId,
      active: active ?? true,
    }),
  });

  revalidatePath("/admin/pricing");

  return { ok: true, data: { id: data.id } };
}

export type TogglePlanPriceActiveResult = Result<{ id: string }>;

/**
 * プラン価格の有効/無効切り替え
 */
export async function togglePlanPriceActive(
  id: string
): Promise<TogglePlanPriceActiveResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
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
