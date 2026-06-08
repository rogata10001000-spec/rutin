"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getUserFromServerCookies } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { Result, toZodErrorMessage } from "./types";
import {
  PLAN_CODES,
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_SLA_LABELS,
  resolveCastPlanPricing,
  type ResolvedPlanPricing,
} from "@/lib/plan-pricing";
import {
  setSubscriptionCancelAtPeriodEnd,
  updateSubscriptionPlanPrice,
} from "@/lib/stripe";
import { changePlanSchema } from "@/schemas/subscription-management";
import type { PlanCode, SubscriptionStatus } from "@/lib/supabase/types";

// 操作可能なステータス（解約済み・未契約は不可）
const MANAGEABLE_STATUSES: SubscriptionStatus[] = ["trial", "active", "past_due", "paused"];

export type ManagedPlanOption = {
  code: PlanCode;
  label: string;
  description: string;
  slaLabel: string;
  monthlyPrice: number;
  available: boolean;
  isCurrent: boolean;
};

export type MySubscriptionView = {
  status: SubscriptionStatus;
  planCode: PlanCode;
  planLabel: string;
  monthlyPrice: number | null;
  castName: string | null;
  currentPeriodEnd: string | null;
  trialEndAt: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  planOptions: ManagedPlanOption[];
};

export type GetMySubscriptionResult = Result<{
  hasSubscription: boolean;
  subscription: MySubscriptionView | null;
}>;

type ResolvedContext = {
  endUserId: string;
  lineUserId: string;
  subscription: {
    id: string;
    stripe_subscription_id: string;
    status: SubscriptionStatus;
    plan_code: string;
    applied_stripe_price_id: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  assignedCastId: string | null;
  pricing: ResolvedPlanPricing;
  trialEndAt: string | null;
};

/**
 * Cookie の LINE トークンから、本人の最新サブスク文脈を解決する。
 * 解約済み/未契約や、本人以外の契約は操作対象にしない。
 */
async function resolveCurrentUserSubscription(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<
  | { ok: true; ctx: ResolvedContext; code?: undefined; message?: undefined }
  | { ok: false; ctx?: undefined; code: "UNAUTHORIZED" | "NOT_FOUND"; message: string }
> {
  const user = await getUserFromServerCookies();
  if (!user.ok) {
    const isExpired = "error" in user && user.error === "expired";
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: isExpired
        ? "ログインの有効期限が切れています。もう一度ログインしてください。"
        : "ログインが必要です。LINEまたはメールからアクセスしてください。",
    };
  }

  // 本人解決は end_user_id を優先、無ければ line_user_id でフォールバック
  let endUserQuery = supabase
    .from("end_users")
    .select("id, line_user_id, assigned_cast_id, trial_end_at");
  if (user.endUserId) {
    endUserQuery = endUserQuery.eq("id", user.endUserId);
  } else if (user.lineUserId) {
    endUserQuery = endUserQuery.eq("line_user_id", user.lineUserId);
  } else {
    return { ok: false, code: "UNAUTHORIZED", message: "ログインが必要です。" };
  }
  const { data: endUser } = await endUserQuery.maybeSingle();

  if (!endUser) {
    return { ok: false, code: "NOT_FOUND", message: "契約情報が見つかりません。" };
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(
      "id, stripe_subscription_id, status, plan_code, applied_stripe_price_id, current_period_end, cancel_at_period_end"
    )
    .eq("end_user_id", endUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return { ok: false, code: "NOT_FOUND", message: "契約情報が見つかりません。" };
  }

  const pricing = await resolveCastPlanPricing(supabase, endUser.assigned_cast_id);

  return {
    ok: true,
    ctx: {
      endUserId: endUser.id,
      lineUserId: endUser.line_user_id,
      subscription: {
        id: subscription.id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        status: subscription.status as SubscriptionStatus,
        plan_code: subscription.plan_code,
        applied_stripe_price_id: subscription.applied_stripe_price_id,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
      assignedCastId: endUser.assigned_cast_id,
      pricing,
      trialEndAt: endUser.trial_end_at,
    },
  };
}

/**
 * 契約・プランページ表示用のデータ取得
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function getMySubscription(): Promise<GetMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);

  if (!resolved.ok) {
    if (resolved.code === "NOT_FOUND") {
      return { ok: true, data: { hasSubscription: false, subscription: null } };
    }
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription, assignedCastId, pricing } = ctx;

  const currentPlan = (PLAN_CODES.includes(subscription.plan_code as PlanCode)
    ? subscription.plan_code
    : "standard") as PlanCode;

  let castName: string | null = null;
  if (assignedCastId) {
    const { data: cast } = await supabase
      .from("staff_profiles")
      .select("display_name")
      .eq("id", assignedCastId)
      .maybeSingle();
    castName = cast?.display_name ?? null;
  }

  const canManage = MANAGEABLE_STATUSES.includes(subscription.status);

  const planOptions: ManagedPlanOption[] = PLAN_CODES.map((code) => ({
    code,
    label: PLAN_LABELS[code],
    description: PLAN_DESCRIPTIONS[code],
    slaLabel: PLAN_SLA_LABELS[code],
    monthlyPrice: pricing[code].amount,
    available: Boolean(pricing[code].stripePriceId),
    isCurrent: code === currentPlan,
  }));

  return {
    ok: true,
    data: {
      hasSubscription: true,
      subscription: {
        status: subscription.status,
        planCode: currentPlan,
        planLabel: PLAN_LABELS[currentPlan],
        monthlyPrice: pricing[currentPlan].amount,
        castName,
        currentPeriodEnd: subscription.current_period_end,
        trialEndAt: ctx.trialEndAt,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canManage,
        planOptions,
      },
    },
  };
}

export type ChangeMyPlanResult = Result<{ planCode: PlanCode }>;

/**
 * プラン変更（アップグレード/ダウングレード）
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function changeMyPlan(input: {
  planCode: PlanCode;
}): Promise<ChangeMyPlanResult> {
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription, pricing } = ctx;
  const newPlan = parsed.data.planCode;

  if (!MANAGEABLE_STATUSES.includes(subscription.status)) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "現在の契約状態ではプランを変更できません。" },
    };
  }

  if (subscription.cancel_at_period_end) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "解約予定中はプランを変更できません。先に解約予定を取り消してください。",
      },
    };
  }

  if (newPlan === subscription.plan_code) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "すでにこのプランをご利用中です。" },
    };
  }

  const newPriceId = pricing[newPlan].stripePriceId;
  if (!newPriceId) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "選択したプランは現在ご利用いただけません。" },
    };
  }

  try {
    await updateSubscriptionPlanPrice({
      subscriptionId: subscription.stripe_subscription_id,
      newStripePriceId: newPriceId,
      planCode: newPlan,
    });
  } catch (err) {
    logger.error("changeMyPlan: stripe update failed", {
      subscriptionId: subscription.stripe_subscription_id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "プラン変更の処理に失敗しました。" },
    };
  }

  // DB を即時反映（Webhook でも再同期される）
  await supabase
    .from("subscriptions")
    .update({ plan_code: newPlan, applied_stripe_price_id: newPriceId })
    .eq("id", subscription.id);

  await supabase
    .from("end_users")
    .update({ plan_code: newPlan })
    .eq("id", ctx.endUserId);

  await writeAuditLog({
    action: "CHANGE_SUBSCRIPTION_PRICE",
    targetType: "subscriptions",
    targetId: subscription.id,
    success: true,
    metadata: buildAuditMetadata(
      {
        line_user_id: ctx.lineUserId,
        new_plan_code: newPlan,
        new_stripe_price_id: newPriceId,
        changed_by: "end_user_self",
      },
      { before: { plan_code: subscription.plan_code } }
    ),
    actorStaffId: null,
  });

  return { ok: true, data: { planCode: newPlan } };
}

export type CancelMySubscriptionResult = Result<{ currentPeriodEnd: string | null }>;

/**
 * 期間終了時解約を申し込む（cancel_at_period_end = true）
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function cancelMySubscription(): Promise<CancelMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription } = ctx;

  if (!MANAGEABLE_STATUSES.includes(subscription.status)) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "現在の契約状態では解約できません。" },
    };
  }

  if (subscription.cancel_at_period_end) {
    return { ok: true, data: { currentPeriodEnd: subscription.current_period_end } };
  }

  try {
    await setSubscriptionCancelAtPeriodEnd(subscription.stripe_subscription_id, true);
  } catch (err) {
    logger.error("cancelMySubscription: stripe update failed", {
      subscriptionId: subscription.stripe_subscription_id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "解約の処理に失敗しました。" },
    };
  }

  await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("id", subscription.id);

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: subscription.id,
    success: true,
    metadata: buildAuditMetadata({
      line_user_id: ctx.lineUserId,
      cancel_at_period_end: true,
      changed_by: "end_user_self",
      operation: "schedule_cancellation",
    }),
    actorStaffId: null,
  });

  return { ok: true, data: { currentPeriodEnd: subscription.current_period_end } };
}

export type ResumeMySubscriptionResult = Result<{ resumed: boolean }>;

/**
 * 解約予定を取り消す（cancel_at_period_end = false）
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function resumeMySubscription(): Promise<ResumeMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription } = ctx;

  if (!MANAGEABLE_STATUSES.includes(subscription.status)) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "現在の契約状態では操作できません。" },
    };
  }

  if (!subscription.cancel_at_period_end) {
    return { ok: true, data: { resumed: true } };
  }

  try {
    await setSubscriptionCancelAtPeriodEnd(subscription.stripe_subscription_id, false);
  } catch (err) {
    logger.error("resumeMySubscription: stripe update failed", {
      subscriptionId: subscription.stripe_subscription_id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "解約予定の取り消しに失敗しました。" },
    };
  }

  await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", subscription.id);

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: subscription.id,
    success: true,
    metadata: buildAuditMetadata({
      line_user_id: ctx.lineUserId,
      cancel_at_period_end: false,
      changed_by: "end_user_self",
      operation: "resume_subscription",
    }),
    actorStaffId: null,
  });

  return { ok: true, data: { resumed: true } };
}
