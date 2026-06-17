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
  DEFAULT_ANNUAL_PRICES,
  annualStripePriceIds,
  isAnnualPriceId,
  type ResolvedPlanPricing,
  type BillingInterval,
} from "@/lib/plan-pricing";
import {
  setSubscriptionCancelAtPeriodEnd,
  setSubscriptionPauseCollection,
  createBillingPortalSession,
  updateSubscriptionPlanPrice,
  toSubscriptionStatus,
} from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";
import { currentPeriodEndFromStripeSubscription } from "@/lib/stripe-subscription-sync";
import { recordSubscriptionLifecycleEvent } from "@/lib/subscription-lifecycle";
import {
  changePlanSchema,
  cancelSubscriptionSchema,
  type CancelSubscriptionInput,
} from "@/schemas/subscription-management";
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
  interval: BillingInterval;
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
    stripe_customer_id: string | null;
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
      "id, stripe_subscription_id, stripe_customer_id, status, plan_code, applied_stripe_price_id, current_period_end, cancel_at_period_end"
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
        stripe_customer_id: subscription.stripe_customer_id,
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

  // 年額契約かどうかは適用中の price_id から判定する。年額のプラン変更・価格表示も年額で揃える。
  const isAnnual = isAnnualPriceId(subscription.applied_stripe_price_id);
  const interval: BillingInterval = isAnnual ? "year" : "month";
  const annualIds = annualStripePriceIds();
  const priceFor = (code: PlanCode) =>
    isAnnual ? DEFAULT_ANNUAL_PRICES[code] : pricing[code].amount;
  const priceIdAvailable = (code: PlanCode) =>
    isAnnual ? Boolean(annualIds[code]) : Boolean(pricing[code].stripePriceId);

  const planOptions: ManagedPlanOption[] = PLAN_CODES.map((code) => ({
    code,
    label: PLAN_LABELS[code],
    description: PLAN_DESCRIPTIONS[code],
    slaLabel: PLAN_SLA_LABELS[code],
    monthlyPrice: priceFor(code),
    available: priceIdAvailable(code),
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
        monthlyPrice: priceFor(currentPlan),
        interval,
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

  // 現在の請求間隔（年額/月額）を維持してプランを切り替える。年額契約は年額Priceへ。
  const isAnnual = isAnnualPriceId(subscription.applied_stripe_price_id);
  const newPriceId = isAnnual
    ? annualStripePriceIds()[newPlan]
    : pricing[newPlan].stripePriceId;
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

  // DB を即時反映（Webhook でも再同期される）。
  // Stripe は更新済みのため、ここでの書込失敗は致命的にせず警告ログのみ（Webhook が後追いで整合させる）。
  const { error: subUpdateError } = await supabase
    .from("subscriptions")
    .update({ plan_code: newPlan, applied_stripe_price_id: newPriceId })
    .eq("id", subscription.id);
  if (subUpdateError) {
    logger.warn("changeMyPlan: subscriptions DB反映に失敗（Webhookで再同期予定）", {
      subscriptionId: subscription.id,
      error: subUpdateError.message,
    });
  }

  const { error: userUpdateError } = await supabase
    .from("end_users")
    .update({ plan_code: newPlan })
    .eq("id", ctx.endUserId);
  if (userUpdateError) {
    logger.warn("changeMyPlan: end_users DB反映に失敗（Webhookで再同期予定）", {
      endUserId: ctx.endUserId,
      error: userUpdateError.message,
    });
  }

  // プラン変更のライフサイクルイベントを記録。
  // 自己解決の変更はDBを先に更新するため Webhook 側の差分検知が空振りする。
  // ここで明示記録し、ファネル分析の計上漏れを防ぐ（source_ref で冪等）。
  await recordSubscriptionLifecycleEvent(supabase, {
    endUserId: ctx.endUserId,
    castId: ctx.assignedCastId,
    eventType: "plan_change",
    planCode: newPlan,
    sourceRefType: "self:plan_change",
    sourceRefId: `${subscription.id}:${new Date().toISOString()}`,
    metadata: {
      line_user_id: ctx.lineUserId,
      previous_plan_code: subscription.plan_code,
      new_plan_code: newPlan,
      changed_by: "end_user_self",
    },
  });

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
export async function cancelMySubscription(
  input?: CancelSubscriptionInput
): Promise<CancelMySubscriptionResult> {
  const parsed = cancelSubscriptionSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }
  const reasonCode = parsed.data.reasonCode ?? null;
  const reasonDetail = parsed.data.reasonDetail?.trim() || null;

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

  let currentPeriodEnd = subscription.current_period_end;
  try {
    const updatedSubscription = await setSubscriptionCancelAtPeriodEnd(
      subscription.stripe_subscription_id,
      true
    );
    currentPeriodEnd =
      currentPeriodEndFromStripeSubscription(updatedSubscription) ?? subscription.current_period_end;
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
    .update({
      cancel_at_period_end: true,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    })
    .eq("id", subscription.id);

  await recordSubscriptionLifecycleEvent(supabase, {
    endUserId: ctx.endUserId,
    castId: ctx.assignedCastId,
    eventType: "cancel_scheduled",
    planCode: subscription.plan_code,
    sourceRefType: "subscription:self_cancel",
    sourceRefId: `${subscription.id}:${new Date().toISOString()}`,
    metadata: {
      line_user_id: ctx.lineUserId,
      cancel_at_period_end: true,
      current_period_end: currentPeriodEnd,
      changed_by: "end_user_self",
      cancel_reason_code: reasonCode,
      cancel_reason_detail: reasonDetail,
    },
  });

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
      cancel_reason_code: reasonCode,
      cancel_reason_detail: reasonDetail,
    }),
    actorStaffId: null,
  });

  return { ok: true, data: { currentPeriodEnd } };
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

  await recordSubscriptionLifecycleEvent(supabase, {
    endUserId: ctx.endUserId,
    castId: ctx.assignedCastId,
    eventType: "resume",
    planCode: subscription.plan_code,
    sourceRefType: "subscription:self_resume",
    sourceRefId: `${subscription.id}:${new Date().toISOString()}`,
    metadata: {
      line_user_id: ctx.lineUserId,
      cancel_at_period_end: false,
      changed_by: "end_user_self",
    },
  });

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

export type PauseMySubscriptionResult = Result<{ paused: boolean }>;

/**
 * 請求を一時停止する（解約防止の代替策）。Stripe pause_collection(void) を設定。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function pauseMySubscription(): Promise<PauseMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription } = ctx;

  if (subscription.status === "paused") {
    return { ok: true, data: { paused: true } };
  }

  if (!MANAGEABLE_STATUSES.includes(subscription.status)) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "現在の契約状態では一時停止できません。" },
    };
  }

  if (subscription.cancel_at_period_end) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "解約予定中は一時停止できません。先に解約予定を取り消してください。",
      },
    };
  }

  try {
    await setSubscriptionPauseCollection(subscription.stripe_subscription_id, true);
  } catch (err) {
    logger.error("pauseMySubscription: stripe update failed", {
      subscriptionId: subscription.stripe_subscription_id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "一時停止の処理に失敗しました。" },
    };
  }

  await supabase.from("subscriptions").update({ status: "paused" }).eq("id", subscription.id);
  await supabase.from("end_users").update({ status: "paused" }).eq("id", ctx.endUserId);

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: subscription.id,
    success: true,
    metadata: buildAuditMetadata({
      line_user_id: ctx.lineUserId,
      changed_by: "end_user_self",
      operation: "pause_subscription",
    }),
    actorStaffId: null,
  });

  return { ok: true, data: { paused: true } };
}

export type ResumePausedSubscriptionResult = Result<{ status: SubscriptionStatus }>;

/**
 * 一時停止を解除して再開する。pause_collection を解除し、Stripe の最新ステータスに同期。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function resumeMyPausedSubscription(): Promise<ResumePausedSubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription } = ctx;

  let nextStatus: SubscriptionStatus = "active";
  try {
    const updated = await setSubscriptionPauseCollection(
      subscription.stripe_subscription_id,
      false
    );
    nextStatus = toSubscriptionStatus(updated.status);
  } catch (err) {
    logger.error("resumeMyPausedSubscription: stripe update failed", {
      subscriptionId: subscription.stripe_subscription_id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "再開の処理に失敗しました。" },
    };
  }

  await supabase.from("subscriptions").update({ status: nextStatus }).eq("id", subscription.id);
  await supabase.from("end_users").update({ status: nextStatus }).eq("id", ctx.endUserId);

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: subscription.id,
    success: true,
    metadata: buildAuditMetadata({
      line_user_id: ctx.lineUserId,
      changed_by: "end_user_self",
      operation: "resume_paused_subscription",
      new_status: nextStatus,
    }),
    actorStaffId: null,
  });

  return { ok: true, data: { status: nextStatus } };
}

export type BillingPortalResult = Result<{ url: string }>;

/**
 * 支払い方法の更新などができる Stripe カスタマーポータルのURLを発行する（支払い失敗リカバリ）。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function createMyBillingPortalSession(): Promise<BillingPortalResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase);
  if (!resolved.ok) {
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const customerId = ctx.subscription.stripe_customer_id;
  if (!customerId) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "お客様の決済情報が見つかりません。" },
    };
  }

  try {
    const url = await createBillingPortalSession(
      customerId,
      `${getServerEnv().APP_BASE_URL}/account/plan`
    );
    return { ok: true, data: { url } };
  } catch (err) {
    logger.error("createMyBillingPortalSession: stripe portal failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "お支払い管理ページを開けませんでした。" },
    };
  }
}
