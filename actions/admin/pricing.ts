"use server";

import { revalidatePath } from "next/cache";
import { pricingOverrideSchema, changeUserSubscriptionPriceSchema } from "@/schemas/pricing";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { stripe } from "@/lib/stripe";
import { ensureRecurringPrice } from "@/lib/stripe-pricing";
import type { PlanCode } from "@/lib/supabase/types";

// =====================================
// メイト別価格オーバーライド
// =====================================

export type PriceOverride = {
  id: string;
  castId: string;
  castName: string;
  planCode: string;
  stripePriceId: string;
  amountMonthly: number;
  amountAnnual: number | null;
  stripePriceIdAnnual: string | null;
  validFrom: string;
  active: boolean;
};

export type GetPriceOverridesResult = Result<{ items: PriceOverride[] }>;

/**
 * 価格オーバーライド一覧取得
 */
export async function getPriceOverrides(): Promise<GetPriceOverridesResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("cast_plan_price_overrides")
    .select(`
      id,
      cast_id,
      plan_code,
      stripe_price_id,
      amount_monthly,
      amount_annual,
      stripe_price_id_annual,
      valid_from,
      active,
      staff_profiles!cast_plan_price_overrides_cast_id_fkey (
        display_name
      )
    `)
    .order("valid_from", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: PriceOverride[] = (data ?? []).map((row) => ({
    id: row.id,
    castId: row.cast_id,
    castName: (row.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? "不明",
    planCode: row.plan_code,
    stripePriceId: row.stripe_price_id,
    amountMonthly: row.amount_monthly,
    amountAnnual: row.amount_annual,
    stripePriceIdAnnual: row.stripe_price_id_annual,
    validFrom: row.valid_from,
    active: row.active,
  }));

  return { ok: true, data: { items } };
}

export type UpsertCastPlanPriceOverrideInput = {
  castId: string;
  planCode: "light" | "standard" | "premium";
  amountMonthly: number;
  amountAnnual?: number;
  active?: boolean;
};

export type UpsertCastPlanPriceOverrideResult = Result<{ id: string }>;

/**
 * メイト別価格オーバーライド作成/更新
 * 金額のみ受け取り、対応する Stripe Price を find-or-create してから保存する
 * （画面の表示額と実際の請求額が常に一致するようにするため）。
 */
export async function upsertCastPlanPriceOverride(
  input: UpsertCastPlanPriceOverrideInput
): Promise<UpsertCastPlanPriceOverrideResult> {
  const parsed = pricingOverrideSchema.safeParse(input);
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

  const { castId, planCode, amountMonthly, amountAnnual, active } = parsed.data;

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
      action: "UPSERT_CAST_PLAN_PRICE",
      targetType: "cast_plan_price_overrides",
      targetId: castId,
      success: false,
      metadata: buildAuditMetadata({
        cast_id: castId,
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
    .from("cast_plan_price_overrides")
    .upsert(
      {
        cast_id: castId,
        plan_code: planCode,
        currency: "JPY",
        stripe_price_id: monthlyPriceId,
        amount_monthly: amountMonthly,
        amount_annual: amountAnnual ?? null,
        stripe_price_id_annual: annualPriceId,
        valid_from: today,
        active: active ?? true,
      },
      {
        onConflict: "cast_id,plan_code",
      }
    )
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "価格設定の保存に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "UPSERT_CAST_PLAN_PRICE",
    targetType: "cast_plan_price_overrides",
    targetId: data.id,
    success: true,
    metadata: buildAuditMetadata({
      cast_id: castId,
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

// =====================================
// ユーザー価格変更
// =====================================

export type ChangeUserSubscriptionPriceInput = {
  endUserId: string;
  mode: "next_cycle" | "immediate";
};

export type ChangeUserSubscriptionPriceResult = Result<{ subscriptionId: string }>;

/**
 * ユーザーの価格変更
 */
export async function changeUserSubscriptionPrice(
  input: ChangeUserSubscriptionPriceInput
): Promise<ChangeUserSubscriptionPriceResult> {
  // Zodバリデーション
  const parsed = changeUserSubscriptionPriceSchema.safeParse(input);
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

  // ユーザーとサブスクリプション取得
  const { data: user } = await supabase
    .from("end_users")
    .select(`
      id,
      assigned_cast_id,
      plan_code,
      subscriptions (
        id,
        stripe_subscription_id,
        status,
        billing_interval
      )
    `)
    .eq("id", input.endUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  const subscription = (user.subscriptions as unknown as {
    id: string;
    stripe_subscription_id: string;
    status: string;
    billing_interval: "month" | "year";
  }[])?.[0];
  if (!subscription || !subscription.stripe_subscription_id) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "有効なサブスクリプションがありません" },
    };
  }

  // 新しい価格IDを取得（契約中の請求間隔に合わせる。年額契約は年額Priceへ）
  const { data: priceOverride } = await supabase
    .from("cast_plan_price_overrides")
    .select("stripe_price_id, stripe_price_id_annual")
    .eq("cast_id", user.assigned_cast_id)
    .eq("plan_code", user.plan_code)
    .eq("active", true)
    .single();

  const newPriceId =
    subscription.billing_interval === "year"
      ? priceOverride?.stripe_price_id_annual
      : priceOverride?.stripe_price_id;

  if (!newPriceId) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message:
          subscription.billing_interval === "year"
            ? "このメイトの年額オーバーライド価格が未設定です"
            : "適用可能な価格が見つかりません",
      },
    };
  }

  try {
    // Stripeサブスクリプション更新
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );

    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: input.mode === "immediate" ? "create_prorations" : "none",
    });

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        applied_stripe_price_id: newPriceId,
      })
      .eq("id", subscription.id);

    if (updateError) {
      await writeAuditLog({
        action: "CHANGE_SUBSCRIPTION_PRICE",
        targetType: "subscriptions",
        targetId: subscription.id,
        success: false,
        metadata: buildAuditMetadata({
          end_user_id: input.endUserId,
          mode: input.mode,
          new_price_id: newPriceId,
          error: "DB_SYNC_FAILED",
        }),
      });
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "サブスク情報の同期に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "CHANGE_SUBSCRIPTION_PRICE",
      targetType: "subscriptions",
      targetId: subscription.id,
      success: true,
      metadata: buildAuditMetadata({
        end_user_id: input.endUserId,
        mode: input.mode,
        new_price_id: newPriceId,
      }),
    });

    revalidatePath("/admin/pricing");
    revalidatePath(`/users/${input.endUserId}`);

    return { ok: true, data: { subscriptionId: subscription.id } };
  } catch (err) {
    await writeAuditLog({
      action: "CHANGE_SUBSCRIPTION_PRICE",
      targetType: "subscriptions",
      targetId: subscription.id,
      success: false,
      metadata: buildAuditMetadata({
        end_user_id: input.endUserId,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
    });

    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "Stripe更新に失敗しました" },
    };
  }
}

// =====================================
// メイト一覧取得（価格設定用）
// =====================================

export type CastListItem = {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
};

export type GetCastsForPricingResult = Result<{ items: CastListItem[] }>;

/**
 * 価格設定用メイト一覧
 */
export async function getCastsForPricing(): Promise<GetCastsForPricingResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, role, active")
    .eq("role", "cast")
    .order("display_name");

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
        id: row.id,
        displayName: row.display_name,
        role: row.role,
        active: row.active,
      })),
    },
  };
}
