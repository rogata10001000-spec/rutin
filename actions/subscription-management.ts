"use server";

import { after } from "next/server";
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
  resolvePlanPricing,
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
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import { currentPeriodEndFromStripeSubscription } from "@/lib/stripe-subscription-sync";
import { recordSubscriptionLifecycleEvent } from "@/lib/subscription-lifecycle";
import {
  changePlanSchema,
  cancelSubscriptionSchema,
  type CancelSubscriptionInput,
} from "@/schemas/subscription-management";
import type { PlanCode, SubscriptionStatus } from "@/lib/supabase/types";
import {
  getLiveContractedCastIds,
  getRelationshipsByLineUserId,
  getRelationshipsByPerson,
  LIVE_SUBSCRIPTION_STATUSES,
} from "@/lib/person";
import { MAX_CONCURRENT_MATES } from "@/lib/relationship-routing";

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
  /** 担当メイトの1枚目の写真（未設定なら null）。マイページの安心感のための表示用。 */
  castPhotoUrl: string | null;
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
  personId: string;
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
  // 契約中の請求間隔。価格表示・プラン変更はこの間隔で揃える。
  interval: BillingInterval;
  // interval に対応した価格（メイト別オーバーライド > デフォルト）
  pricing: ResolvedPlanPricing;
  trialEndAt: string | null;
};

type PersonScope =
  | {
      ok: true;
      personId: string;
      lineUserId: string | null;
      /** この人が持つ関係行（メイトごとに1行） */
      endUserIds: string[];
    }
  | { ok: false; code: "UNAUTHORIZED" | "NOT_FOUND"; message: string };

/**
 * Cookie の本人情報から「人（person）」とその関係行をすべて解決する。
 *
 * 複数メイト契約に対応したため、1人が複数の end_users 行を持つ。
 * `.eq("line_user_id", uid).maybeSingle()` は2行目ができた瞬間に壊れるため使わない。
 */
async function resolvePersonScope(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  user: { endUserId?: string | null; lineUserId?: string | null }
): Promise<PersonScope> {
  let personId: string | null = null;
  let lineUserId: string | null = user.lineUserId ?? null;

  if (user.endUserId) {
    const { data } = await supabase
      .from("end_users")
      .select("person_id, line_user_id")
      .eq("id", user.endUserId)
      .maybeSingle();
    personId = data?.person_id ?? null;
    lineUserId = lineUserId ?? data?.line_user_id ?? null;
  } else if (user.lineUserId) {
    const rows = await getRelationshipsByLineUserId(supabase, user.lineUserId);
    personId = rows[0]?.personId ?? null;
  } else {
    return { ok: false, code: "UNAUTHORIZED", message: "ログインが必要です。" };
  }

  if (!personId) {
    return { ok: false, code: "NOT_FOUND", message: "契約情報が見つかりません。" };
  }

  const relationships = await getRelationshipsByPerson(supabase, personId);
  return {
    ok: true,
    personId,
    lineUserId: lineUserId ?? relationships.find((r) => r.lineUserId)?.lineUserId ?? null,
    endUserIds: relationships.map((r) => r.endUserId),
  };
}

/**
 * Cookie の LINE トークンから、本人の最新サブスク文脈を解決する。
 * 解約済み/未契約や、本人以外の契約は操作対象にしない。
 */
async function resolveCurrentUserSubscription(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  targetEndUserId?: string
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

  // 複数メイト契約に対応したため、本人（person）の関係行は複数ありうる。
  // どの契約を操作するかは targetEndUserId で明示し、未指定なら最新のライブ契約を選ぶ。
  const scope = await resolvePersonScope(supabase, user);
  if ("code" in scope) {
    return { ok: false, code: scope.code, message: scope.message };
  }

  // 他人の契約を操作させない（Cookie の本人が持つ関係行だけを対象にする）
  if (targetEndUserId && !scope.endUserIds.includes(targetEndUserId)) {
    return { ok: false, code: "NOT_FOUND", message: "ご契約情報が見つかりません。" };
  }

  const targetIds = targetEndUserId ? [targetEndUserId] : scope.endUserIds;

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, end_user_id, stripe_subscription_id, stripe_customer_id, status, plan_code, applied_stripe_price_id, billing_interval, current_period_end, cancel_at_period_end"
    )
    .in("end_user_id", targetIds)
    .order("created_at", { ascending: false });

  // ライブ契約を優先して選ぶ（解約済みが最新でも、操作対象は生きている契約）
  const subscription =
    (subscriptions ?? []).find((row) =>
      (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(row.status)
    ) ?? (subscriptions ?? [])[0];

  if (!subscription) {
    return { ok: false, code: "NOT_FOUND", message: "契約情報が見つかりません。" };
  }

  const { data: endUser } = await supabase
    .from("end_users")
    .select("id, line_user_id, assigned_cast_id, trial_end_at")
    .eq("id", subscription.end_user_id)
    .maybeSingle();

  if (!endUser) {
    return { ok: false, code: "NOT_FOUND", message: "契約情報が見つかりません。" };
  }

  // 請求間隔は billing_interval 列を優先。未設定（旧データ）は price_id から年額判定でフォールバック。
  const interval: BillingInterval =
    subscription.billing_interval === "year"
      ? "year"
      : isAnnualPriceId(subscription.applied_stripe_price_id)
        ? "year"
        : "month";

  const pricing = await resolvePlanPricing(supabase, endUser.assigned_cast_id, interval);

  return {
    ok: true,
    ctx: {
      personId: scope.personId,
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
      interval,
      pricing,
      trialEndAt: endUser.trial_end_at,
    },
  };
}

/**
 * 契約・プランページ表示用のデータ取得
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function getMySubscription(input?: {
  endUserId?: string;
}): Promise<GetMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);

  if (!resolved.ok) {
    if (resolved.code === "NOT_FOUND") {
      return { ok: true, data: { hasSubscription: false, subscription: null } };
    }
    return { ok: false, error: { code: resolved.code, message: resolved.message } };
  }

  const { ctx } = resolved;
  const { subscription, assignedCastId, pricing, interval } = ctx;

  const currentPlan = (PLAN_CODES.includes(subscription.plan_code as PlanCode)
    ? subscription.plan_code
    : "standard") as PlanCode;

  // 担当メイト情報・写真・プラン表示文言は互いに独立 → 並列取得。
  // プラン名・説明・返信目安は申込画面と同じ編集可能文言（funnel_copy）から解決し、
  // 管理画面で文言を変えたとき申込画面とマイページがズレないようにする（単一の真実のソース）。
  const [castRow, castPhotoRow, copy] = await Promise.all([
    assignedCastId
      ? supabase
          .from("staff_profiles")
          .select("display_name")
          .eq("id", assignedCastId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    assignedCastId
      ? supabase
          .from("cast_photos")
          .select("storage_path")
          .eq("cast_id", assignedCastId)
          .eq("active", true)
          .order("display_order", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getFunnelCopyValues([
      "plan.name.light",
      "plan.name.standard",
      "plan.name.premium",
      "plan.desc.light",
      "plan.desc.standard",
      "plan.desc.premium",
      "plan.sla.light",
      "plan.sla.standard",
      "plan.sla.premium",
    ]),
  ]);

  const castName = castRow.data?.display_name ?? null;
  const castPhotoUrl = castPhotoRow.data?.storage_path
    ? supabase.storage.from("cast-photos").getPublicUrl(castPhotoRow.data.storage_path).data
        .publicUrl
    : null;

  const canManage = MANAGEABLE_STATUSES.includes(subscription.status);

  // 価格・利用可否は契約中の請求間隔で解決済みの ctx.pricing を使う
  // （メイト別オーバーライド > デフォルト(plan_prices) > フォールバック）。

  const planOptions: ManagedPlanOption[] = PLAN_CODES.map((code) => ({
    code,
    label: copy[`plan.name.${code}`] ?? PLAN_LABELS[code],
    description: copy[`plan.desc.${code}`] ?? PLAN_DESCRIPTIONS[code],
    slaLabel: copy[`plan.sla.${code}`] ?? PLAN_SLA_LABELS[code],
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
        planLabel: copy[`plan.name.${currentPlan}`] ?? PLAN_LABELS[currentPlan],
        monthlyPrice: pricing[currentPlan].amount,
        interval,
        castName,
        castPhotoUrl,
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
  /** 操作対象の契約（複数メイト契約時に必須。未指定なら最新のライブ契約） */
  endUserId?: string;
}): Promise<ChangeMyPlanResult> {
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

  // 現在の請求間隔（年額/月額）を維持してプランを切り替える。
  // ctx.pricing は契約中の間隔で解決済み（年額契約なら年額Priceが入る）。
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

  // DB を即時反映（Webhook でも再同期される）。2テーブルへの反映は互いに独立 → 並列。
  // Stripe は更新済みのため、ここでの書込失敗は致命的にせず警告ログのみ（Webhook が後追いで整合させる）。
  const [{ error: subUpdateError }, { error: userUpdateError }] = await Promise.all([
    supabase
      .from("subscriptions")
      .update({ plan_code: newPlan, applied_stripe_price_id: newPriceId })
      .eq("id", subscription.id),
    supabase.from("end_users").update({ plan_code: newPlan }).eq("id", ctx.endUserId),
  ]);
  if (subUpdateError) {
    logger.warn("changeMyPlan: subscriptions DB反映に失敗（Webhookで再同期予定）", {
      subscriptionId: subscription.id,
      error: subUpdateError.message,
    });
  }
  if (userUpdateError) {
    logger.warn("changeMyPlan: end_users DB反映に失敗（Webhookで再同期予定）", {
      endUserId: ctx.endUserId,
      error: userUpdateError.message,
    });
  }

  // ライフサイクルイベントと監査ログは記帳のみで、プラン変更の結果を左右しない。
  // 本人を待たせないよう応答後に実行する（after は promise を返すコールバックの完了を待つ）。
  const endUserId = ctx.endUserId;
  const assignedCastId = ctx.assignedCastId;
  const lineUserId = ctx.lineUserId;
  const subscriptionId = subscription.id;
  const previousPlanCode = subscription.plan_code;
  // 記録する時刻は後処理の実行時刻ではなく操作時刻
  const changedAt = new Date().toISOString();

  after(async () => {
    try {
      // プラン変更のライフサイクルイベントを記録。
      // 自己解決の変更はDBを先に更新するため Webhook 側の差分検知が空振りする。
      // ここで明示記録し、ファネル分析の計上漏れを防ぐ（source_ref で冪等）。
      await recordSubscriptionLifecycleEvent(supabase, {
        endUserId,
        castId: assignedCastId,
        eventType: "plan_change",
        planCode: newPlan,
        sourceRefType: "self:plan_change",
        sourceRefId: `${subscriptionId}:${changedAt}`,
        metadata: {
          line_user_id: lineUserId,
          previous_plan_code: previousPlanCode,
          new_plan_code: newPlan,
          changed_by: "end_user_self",
        },
      });

      await writeAuditLog({
        action: "CHANGE_SUBSCRIPTION_PRICE",
        targetType: "subscriptions",
        targetId: subscriptionId,
        success: true,
        metadata: buildAuditMetadata(
          {
            line_user_id: lineUserId,
            new_plan_code: newPlan,
            new_stripe_price_id: newPriceId,
            changed_by: "end_user_self",
          },
          { before: { plan_code: previousPlanCode } }
        ),
        actorStaffId: null,
      });
    } catch (err) {
      logger.error("changeMyPlan: 記帳（ライフサイクル/監査ログ）に失敗", {
        subscriptionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
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
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

  // 解約予定は Stripe・DB とも確定済み。ライフサイクルイベントと監査ログは記帳のみで
  // 結果を左右しないため、本人を待たせず応答後に実行する。
  const endUserId = ctx.endUserId;
  const assignedCastId = ctx.assignedCastId;
  const lineUserId = ctx.lineUserId;
  const subscriptionId = subscription.id;
  const planCode = subscription.plan_code;
  const canceledPeriodEnd = currentPeriodEnd;
  // 記録する時刻は後処理の実行時刻ではなく操作時刻
  const canceledAt = new Date().toISOString();

  after(async () => {
    try {
      await recordSubscriptionLifecycleEvent(supabase, {
        endUserId,
        castId: assignedCastId,
        eventType: "cancel_scheduled",
        planCode,
        sourceRefType: "subscription:self_cancel",
        sourceRefId: `${subscriptionId}:${canceledAt}`,
        metadata: {
          line_user_id: lineUserId,
          cancel_at_period_end: true,
          current_period_end: canceledPeriodEnd,
          changed_by: "end_user_self",
          cancel_reason_code: reasonCode,
          cancel_reason_detail: reasonDetail,
        },
      });

      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: subscriptionId,
        success: true,
        metadata: buildAuditMetadata({
          line_user_id: lineUserId,
          cancel_at_period_end: true,
          changed_by: "end_user_self",
          operation: "schedule_cancellation",
          cancel_reason_code: reasonCode,
          cancel_reason_detail: reasonDetail,
        }),
        actorStaffId: null,
      });
    } catch (err) {
      logger.error("cancelMySubscription: 記帳（ライフサイクル/監査ログ）に失敗", {
        subscriptionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return { ok: true, data: { currentPeriodEnd } };
}

export type ResumeMySubscriptionResult = Result<{ resumed: boolean }>;

/**
 * 解約予定を取り消す（cancel_at_period_end = false）
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function resumeMySubscription(
  input?: { endUserId?: string }
): Promise<ResumeMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

  // 解約予定の取り消しは確定済み。記帳（ライフサイクル/監査ログ）は応答後に実行する。
  const endUserId = ctx.endUserId;
  const assignedCastId = ctx.assignedCastId;
  const lineUserId = ctx.lineUserId;
  const subscriptionId = subscription.id;
  const planCode = subscription.plan_code;
  // 記録する時刻は後処理の実行時刻ではなく操作時刻
  const resumedAt = new Date().toISOString();

  after(async () => {
    try {
      await recordSubscriptionLifecycleEvent(supabase, {
        endUserId,
        castId: assignedCastId,
        eventType: "resume",
        planCode,
        sourceRefType: "subscription:self_resume",
        sourceRefId: `${subscriptionId}:${resumedAt}`,
        metadata: {
          line_user_id: lineUserId,
          cancel_at_period_end: false,
          changed_by: "end_user_self",
        },
      });

      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: subscriptionId,
        success: true,
        metadata: buildAuditMetadata({
          line_user_id: lineUserId,
          cancel_at_period_end: false,
          changed_by: "end_user_self",
          operation: "resume_subscription",
        }),
        actorStaffId: null,
      });
    } catch (err) {
      logger.error("resumeMySubscription: 記帳（ライフサイクル/監査ログ）に失敗", {
        subscriptionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return { ok: true, data: { resumed: true } };
}

export type PauseMySubscriptionResult = Result<{ paused: boolean }>;

/**
 * 請求を一時停止する（解約防止の代替策）。Stripe pause_collection(void) を設定。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function pauseMySubscription(
  input?: { endUserId?: string }
): Promise<PauseMySubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

  // 2テーブルへの状態反映は互いに独立 → 並列で往復を1回分削減
  await Promise.all([
    supabase.from("subscriptions").update({ status: "paused" }).eq("id", subscription.id),
    supabase.from("end_users").update({ status: "paused" }).eq("id", ctx.endUserId),
  ]);

  // 一時停止は確定済み。監査ログは応答をブロックせず after() で記録する。
  const lineUserId = ctx.lineUserId;
  const subscriptionId = subscription.id;

  after(async () => {
    try {
      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: subscriptionId,
        success: true,
        metadata: buildAuditMetadata({
          line_user_id: lineUserId,
          changed_by: "end_user_self",
          operation: "pause_subscription",
        }),
        actorStaffId: null,
      });
    } catch (err) {
      logger.error("pauseMySubscription: 監査ログの記録に失敗", {
        subscriptionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return { ok: true, data: { paused: true } };
}

export type ResumePausedSubscriptionResult = Result<{ status: SubscriptionStatus }>;

/**
 * 一時停止を解除して再開する。pause_collection を解除し、Stripe の最新ステータスに同期。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function resumeMyPausedSubscription(
  input?: { endUserId?: string }
): Promise<ResumePausedSubscriptionResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

  // 2テーブルへの状態反映は互いに独立 → 並列で往復を1回分削減
  await Promise.all([
    supabase.from("subscriptions").update({ status: nextStatus }).eq("id", subscription.id),
    supabase.from("end_users").update({ status: nextStatus }).eq("id", ctx.endUserId),
  ]);

  // 再開は確定済み。監査ログは応答をブロックせず after() で記録する。
  const lineUserId = ctx.lineUserId;
  const subscriptionId = subscription.id;
  const resumedStatus = nextStatus;

  after(async () => {
    try {
      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: subscriptionId,
        success: true,
        metadata: buildAuditMetadata({
          line_user_id: lineUserId,
          changed_by: "end_user_self",
          operation: "resume_paused_subscription",
          new_status: resumedStatus,
        }),
        actorStaffId: null,
      });
    } catch (err) {
      logger.error("resumeMyPausedSubscription: 監査ログの記録に失敗", {
        subscriptionId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return { ok: true, data: { status: nextStatus } };
}

export type BillingPortalResult = Result<{ url: string }>;

/**
 * 支払い方法の更新などができる Stripe カスタマーポータルのURLを発行する（支払い失敗リカバリ）。
 * 権限: LINE 案内リンクから入った本人のみ
 */
export async function createMyBillingPortalSession(
  input?: { endUserId?: string }
): Promise<BillingPortalResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveCurrentUserSubscription(supabase, input?.endUserId);
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

// =====================================================
// 複数メイト契約: マイページ用の一覧取得
// =====================================================

export type AvailableMate = {
  castId: string;
  displayName: string;
  photoUrl: string | null;
};

export type MySubscriptionsView = {
  /** 契約ごと（メイトごと）のカード。ライブ契約のみ */
  subscriptions: (MySubscriptionView & { endUserId: string })[];
  /** 追加契約できるメイトが残っているか（CTAの表示可否） */
  canAddMate: boolean;
  /** 追加できない理由（CTAを出さないときの説明用） */
  addMateBlockedReason: "limit_reached" | "no_available_mate" | null;
  /** 同時契約できるメイト数の上限 */
  maxConcurrentMates: number;
};

export type GetMySubscriptionsResult = Result<MySubscriptionsView>;

/**
 * その人のすべてのライブ契約を返す（マイページ用）。
 *
 * 1契約しか無い場合も配列1件で返す。画面側は件数で出し分けるだけでよく、
 * 「1契約用の画面」と「複数契約用の画面」を作り分けない
 * （[同一データの複数の出口はパリティを保つ] の通り、出口を増やすとズレる）。
 */
export async function getMySubscriptions(): Promise<GetMySubscriptionsResult> {
  const supabase = createAdminSupabaseClient();

  const user = await getUserFromServerCookies();
  if (!user.ok) {
    const isExpired = "error" in user && user.error === "expired";
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: isExpired
          ? "ログインの有効期限が切れています。もう一度ログインしてください。"
          : "ログインが必要です。LINEまたはメールからアクセスしてください。",
      },
    };
  }

  const scope = await resolvePersonScope(supabase, user);
  if ("code" in scope) {
    if (scope.code === "NOT_FOUND") {
      return {
        ok: true,
        data: {
          subscriptions: [],
          canAddMate: true,
          addMateBlockedReason: null,
          maxConcurrentMates: MAX_CONCURRENT_MATES,
        },
      };
    }
    return { ok: false, error: { code: scope.code, message: scope.message } };
  }

  // ライブ契約を持つ関係行だけを対象にする（解約済みはカードに出さない）
  const { data: liveRows } = await supabase
    .from("subscriptions")
    .select("end_user_id")
    .in("end_user_id", scope.endUserIds)
    .in("status", [...LIVE_SUBSCRIPTION_STATUSES]);

  const liveEndUserIds = [...new Set((liveRows ?? []).map((r) => r.end_user_id))];

  // 契約ごとの詳細は既存の1件取得を再利用する（表示ロジックを二重に持たない）
  const views: (MySubscriptionView & { endUserId: string })[] = [];
  for (const endUserId of liveEndUserIds) {
    const one = await getMySubscription({ endUserId });
    if (one.ok && one.data.subscription) {
      views.push({ ...one.data.subscription, endUserId });
    }
  }

  // 表示順は「契約が新しい順」ではなく メイト名 で安定させる
  // （並びが読み込みごとに変わると、解約ボタンの位置が動いて誤操作の元になる）
  views.sort((a, b) => (a.castName ?? "").localeCompare(b.castName ?? "", "ja"));

  const liveCastIds = await getLiveContractedCastIds(supabase, scope.personId);

  // 追加できるメイトが実在するかまで見る（枠が空いていても候補ゼロならCTAを出さない）
  const { data: castRows } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("role", "cast")
    .eq("active", true)
    .eq("accepting_new_users", true);

  const selectableCount = (castRows ?? []).filter((c) => !liveCastIds.includes(c.id)).length;

  const limitReached = liveCastIds.length >= MAX_CONCURRENT_MATES;
  const canAddMate = !limitReached && selectableCount > 0;

  return {
    ok: true,
    data: {
      subscriptions: views,
      canAddMate,
      addMateBlockedReason: canAddMate
        ? null
        : limitReached
          ? "limit_reached"
          : "no_available_mate",
      maxConcurrentMates: MAX_CONCURRENT_MATES,
    },
  };
}
