import Stripe from "stripe";
import { after } from "next/server";
import {
  verifyStripeSignature,
  toSubscriptionStatus,
  createBillingPortalSession,
  cancelStripeSubscription,
} from "@/lib/stripe";
import {
  pushToOperatorRecipients,
} from "@/lib/operator-notifications";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { withWebhookIdempotency } from "@/lib/webhook";
import { writeAuditLog } from "@/lib/audit";
import { switchRichMenu } from "@/lib/line";
import { getDefaultLineAccount } from "@/lib/line-accounts";
import { checkRateLimit, requestKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  currentPeriodEndFromStripeSubscription,
  endUserNicknameFromLineId,
  fetchStripeSubscription,
  syncNewSubscriptionSideEffects,
  trialEndAtFromSubscription,
} from "@/lib/stripe-subscription-sync";
import { recordSubscriptionLifecycleEvent } from "@/lib/subscription-lifecycle";
import type { PayoutScopeType, SubscriptionStatus } from "@/lib/supabase/types";
import {
  PLAN_CODES,
  resolvePlanCodeFromAppliedPrice,
} from "@/lib/plan-pricing";
import { normalizeEmail } from "@/lib/email-address";
import { notifyUser } from "@/lib/notifications";
import {
  paymentFailedNotification,
  subscriptionCanceledNotification,
  cancelScheduledNotification,
} from "@/lib/notification-templates";
import {
  ensureRelationshipForCast,
  getLiveContractedCastIds,
  getPersonIdForEndUser,
} from "@/lib/person";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

function stripeWebhookErrorResponse(eventType: string, eventId: string, message: string) {
  logger.error("Stripe webhook processing error", { eventType, eventId, message });
  return Response.json(
    { received: false, error: "processing_failed" },
    { status: 500 }
  );
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Stripe APIバージョンで invoice の形が違う:
  //   〜acacia: invoice.subscription
  //   basil以降(2025-03〜): invoice.parent.subscription_details.subscription
  // Webhookイベントは「Stripeダッシュボードのアカウント設定バージョン」で送られるため、
  // SDKの apiVersion 固定では守れない。旧形しか読んでいなかった結果、
  // 全ての invoice.paid が「サブスクリプションなし」として黙ってスキップされ、
  // 売上記録(revenue_events)がサービス開始以来1件も書かれていなかった
  // （2026-08-21 発覚。支払い失敗の past_due 遷移・通知も同様に不発だった）。
  const raw = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null } | null;
    } | null;
  };

  const legacy = raw.subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;

  const nested = raw.parent?.subscription_details?.subscription;
  if (nested) return typeof nested === "string" ? nested : nested.id;

  return null;
}

async function getActiveTaxRate(supabase: SupabaseAdmin) {
  const { data: taxRate, error } = await supabase
    .from("tax_rates")
    .select("id, rate")
    .eq("active", true)
    .lte("effective_from", new Date().toISOString().split("T")[0])
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();

  if (error || !taxRate) {
    throw new Error("Active tax rate not found");
  }

  return taxRate;
}

async function resolveSubscriptionPayoutRule(
  supabase: SupabaseAdmin,
  castId: string,
  planCode: string,
  occurredOn: string
): Promise<{ id: string; percent: number } | null> {
  const candidates: Array<{
    scope_type: PayoutScopeType;
    cast_id: string | null;
    plan_code: string | null;
  }> = [
    { scope_type: "cast_plan", cast_id: castId, plan_code: planCode },
    { scope_type: "cast", cast_id: castId, plan_code: null },
    { scope_type: "global", cast_id: null, plan_code: null },
  ];

  for (const candidate of candidates) {
    let query = supabase
      .from("payout_rules")
      .select("id, percent")
      .eq("rule_type", "subscription_share")
      .eq("scope_type", candidate.scope_type)
      .eq("active", true)
      .lte("effective_from", occurredOn)
      .or(`effective_to.is.null,effective_to.gte.${occurredOn}`)
      .order("effective_from", { ascending: false })
      .limit(1);

    query =
      candidate.cast_id === null
        ? query.is("cast_id", null)
        : query.eq("cast_id", candidate.cast_id);

    query =
      candidate.plan_code === null
        ? query.is("plan_code", null)
        : query.eq("plan_code", candidate.plan_code);

    const { data: rule } = await query.single();
    if (rule) return rule;
  }

  return null;
}

/**
 * 初回割当後にキャスト定員超過を検知し、ログ＋監査ログで運用に可視化する（best-effort）。
 * 同時申込レースで稀に定員を超えるケースがあるが、決済済みのため割当は honored とし、
 * ここでは「検知して通知する」ことで運用側が再配置できるようにする。失敗しても本処理は止めない。
 */
/**
 * 1ユーザー=1契約（=1メイト）の防御・第2層。
 * 既に別のライブ契約を持つユーザーに対して新しいStripeサブスクリプションが完了した場合
 * （複数チェックアウトの同時進行＝二重課金レース）、既存契約を正として、
 * 新しい方を即時キャンセルし、割当・状態は一切上書きしない。
 *
 * 第1層（新規発行時の前セッション失効）をすり抜けた場合にだけ発火する。
 * 戻り値 true = 重複だった（呼び出し元は end_users 更新・subscriptions 挿入・
 * 副作用の同期をすべてスキップする）。行を挿入しないため、キャンセルに伴う
 * customer.subscription.updated / deleted webhook は「行が見つからない」経路で
 * 安全にスキップされ、生きている契約の状態を汚さない。
 */
async function cancelIfDuplicateLiveSubscription(
  supabase: SupabaseAdmin,
  params: {
    endUserId: string;
    incomingSubscriptionId: string;
    castId: string;
    planCode: string;
    eventType: string;
  }
): Promise<boolean> {
  const { data: existingLive } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, plan_code")
    .eq("end_user_id", params.endUserId)
    .in("status", ["trial", "active", "past_due", "paused"])
    .neq("stripe_subscription_id", params.incomingSubscriptionId)
    .limit(1)
    .maybeSingle();

  if (!existingLive) return false;

  logger.error("stripe webhook: duplicate live subscription detected", {
    endUserId: params.endUserId,
    existingSubscriptionId: existingLive.stripe_subscription_id,
    incomingSubscriptionId: params.incomingSubscriptionId,
    eventType: params.eventType,
  });

  // 新しい方を即時キャンセル。checkout.session.completed と customer.subscription.created の
  // 両イベントが同じ重複を検知するため、キャンセル済みなら false（=通知・記録は初回のみ）。
  let canceledNow = false;
  let cancelFailed = false;
  try {
    canceledNow = await cancelStripeSubscription(params.incomingSubscriptionId);
  } catch (err) {
    cancelFailed = true;
    logger.error("stripe webhook: duplicate subscription auto-cancel failed", {
      incomingSubscriptionId: params.incomingSubscriptionId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  if (canceledNow || cancelFailed) {
    await writeAuditLog({
      action: "SUBSCRIPTION_DUPLICATE_CANCELED",
      targetType: "subscriptions",
      targetId: params.incomingSubscriptionId,
      success: !cancelFailed,
      metadata: {
        end_user_id: params.endUserId,
        existing_subscription_id: existingLive.stripe_subscription_id,
        existing_plan_code: existingLive.plan_code,
        incoming_plan_code: params.planCode,
        incoming_cast_id: params.castId,
        event: params.eventType,
      },
      actorStaffId: null,
    });

    // 運営へLINE通知（返金の要否は人が判断する）。宛先は新規会員通知と同じ通知先を使う。
    try {
      const message =
        `⚠️ 二重契約を検知しました\n\n` +
        `同じ会員が2つ目のサブスクリプションを完了したため、` +
        (cancelFailed
          ? `自動キャンセルを試みましたが失敗しました。Stripeダッシュボードで手動対応してください。\n`
          : `新しい方を自動キャンセルしました。請求が発生していれば返金をご検討ください。\n`) +
        `\n既存: ${existingLive.stripe_subscription_id}\n` +
        `重複: ${params.incomingSubscriptionId}`;
      await pushToOperatorRecipients(supabase, "new_member", message);
    } catch (err) {
      logger.error("stripe webhook: duplicate subscription operator notify failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return true;
}

/**
 * subscriptions への INSERT が 23505 で失敗したとき、どちらの一意制約に当たったのかを判別する。
 *
 * - "same_subscription": stripe_subscription_id の重複（＝同じ契約のイベント再送）。従来どおり UPDATE する。
 * - "duplicate_live":   uq_subscriptions_live_per_user 違反（＝別のライブ契約が既にある）。
 *                       cancelIfDuplicateLiveSubscription のSELECTとINSERTの隙間に
 *                       別の契約が入った場合にここへ来る。行は作らず新しい方をキャンセルする。
 *
 * 制約名の文字列で判定すると命名変更で静かに壊れるため、
 * 「同じ subscription_id の行が実在するか」という事実で判別する。
 *
 * ここを取り違えると、UPDATE が 0 件ヒットで静かに成功し、
 * 「Stripe では課金されているのに自DBに契約行が無い（＝ユーザーが解約もできない）」状態になる。
 */
async function resolveSubscriptionInsertConflict(
  supabase: SupabaseAdmin,
  params: {
    endUserId: string;
    subscriptionId: string;
    castId: string;
    planCode: string;
    eventType: string;
  }
): Promise<"same_subscription" | "duplicate_live"> {
  const { data: sameSubscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", params.subscriptionId)
    .maybeSingle();

  if (sameSubscription) return "same_subscription";

  await cancelIfDuplicateLiveSubscription(supabase, {
    endUserId: params.endUserId,
    incomingSubscriptionId: params.subscriptionId,
    castId: params.castId,
    planCode: params.planCode,
    eventType: `${params.eventType} (insert conflict)`,
  });

  return "duplicate_live";
}

async function warnIfCastOverCapacity(supabase: SupabaseAdmin, castId: string): Promise<void> {
  try {
    const { data: cast } = await supabase
      .from("staff_profiles")
      .select("capacity_limit")
      .eq("id", castId)
      .maybeSingle();
    if (!cast || cast.capacity_limit === null) return;

    const { count } = await supabase
      .from("end_users")
      .select("*", { count: "exact", head: true })
      .eq("assigned_cast_id", castId)
      .not("status", "in", '("incomplete","canceled")');

    const assigned = count ?? 0;
    if (assigned > cast.capacity_limit) {
      logger.warn("cast capacity exceeded after assignment", {
        castId,
        assigned,
        capacityLimit: cast.capacity_limit,
      });
      await writeAuditLog({
        action: "CAST_CAPACITY_EXCEEDED",
        targetType: "staff_profiles",
        targetId: castId,
        success: true,
        metadata: { assigned, capacity_limit: cast.capacity_limit },
        actorStaffId: null,
      });
    }
  } catch (err) {
    logger.warn("warnIfCastOverCapacity failed", {
      castId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * 状態の後退禁止。
 * Stripeイベントは到着順が保証されず、支払い確定前に取得した incomplete が
 * 確定後の active を上書きする「後退」が起きうる。incomplete は初期状態であり、
 * 行が既に存在するなら常に同等以上の情報を持っているため、
 * 既存行の status を incomplete で上書きすることは一切しない
 * （canceled 等への遷移は正当な前進なので通す）。
 */
function statusPatch(nextStatus: SubscriptionStatus): { status?: SubscriptionStatus } {
  return nextStatus === "incomplete" ? {} : { status: nextStatus };
}

export type RevenueRecognitionResult =
  | { skipped: true; reason: string }
  | { revenueEventId: string; payoutAmount: number };

export async function recognizeSubscriptionRevenue(
  supabase: SupabaseAdmin,
  invoice: Stripe.Invoice
): Promise<RevenueRecognitionResult> {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) {
    return { skipped: true, reason: "invoice has no subscription" };
  }

  const amountInclTax = invoice.amount_paid ?? 0;
  if (amountInclTax <= 0) {
    return { skipped: true, reason: "invoice amount is zero" };
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, end_user_id, plan_code, status, end_users!inner(assigned_cast_id)")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscription) {
    logger.warn("invoice.paid: subscription row not found", {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId,
    });
    return { skipped: true, reason: "subscription not found in database" };
  }

  // 支払い確定は「契約が生きている」ことの確実なシグナル。
  // イベント到着順の逆転（updated が行の無い時点で届いてスキップ→ completed/created が
  // 支払い確定前の incomplete を保存）で取り残された行を、ここで最終的に収束させる。
  // 実例: 2026-08-20 の追加契約が incomplete のまま残り、課金済みなのに未契約扱いになった。
  if (subscription.status === "incomplete") {
    try {
      const live = await fetchStripeSubscription(subscriptionId);
      const liveStatus = toSubscriptionStatus(live.status);
      if (liveStatus !== "incomplete") {
        await supabase
          .from("subscriptions")
          .update({
            status: liveStatus,
            ...(currentPeriodEndFromStripeSubscription(live)
              ? { current_period_end: currentPeriodEndFromStripeSubscription(live) }
              : {}),
          })
          .eq("id", subscription.id);
        await supabase
          .from("end_users")
          .update({ status: liveStatus })
          .eq("id", subscription.end_user_id);
        // 支払い済み＝subscribed_at が空なら補完（単調ガード: 既に値があれば触らない）
        await supabase
          .from("end_users")
          .update({ subscribed_at: new Date().toISOString() })
          .eq("id", subscription.end_user_id)
          .is("subscribed_at", null);
        logger.warn("invoice.paid: recovered stuck incomplete subscription", {
          subscriptionId: subscription.id,
          newStatus: liveStatus,
        });
      }
    } catch (err) {
      // 収束は best-effort（売上認識自体は止めない）。次の invoice.paid で再試行される
      logger.error("invoice.paid: incomplete recovery failed", {
        subscriptionId: subscription.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const endUser = subscription.end_users as unknown as { assigned_cast_id: string | null };
  const castId = endUser.assigned_cast_id;
  if (!castId) {
    logger.warn("invoice.paid: assigned cast missing", {
      stripeInvoiceId: invoice.id,
      subscriptionId: subscription.id,
    });
    return { skipped: true, reason: "assigned cast not set" };
  }

  const occurredOn = new Date((invoice.created ?? Math.floor(Date.now() / 1000)) * 1000)
    .toISOString()
    .split("T")[0];

  let taxRate: { id: string; rate: number };
  try {
    taxRate = await getActiveTaxRate(supabase);
  } catch (err) {
    logger.warn("invoice.paid: active tax rate not found", {
      stripeInvoiceId: invoice.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { skipped: true, reason: "active tax rate not found" };
  }
  const taxRateValue = Number(taxRate.rate);
  const amountExclTax = Math.floor(amountInclTax / (1 + taxRateValue));
  const taxJpy = amountInclTax - amountExclTax;

  let revenueEventId: string | null = null;
  const { data: insertedRevenue, error: revenueError } = await supabase
    .from("revenue_events")
    .insert({
      event_type: "subscription_monthly",
      end_user_id: subscription.end_user_id,
      cast_id: castId,
      occurred_on: occurredOn,
      amount_excl_tax_jpy: amountExclTax,
      tax_rate_id: taxRate.id,
      tax_jpy: taxJpy,
      amount_incl_tax_jpy: amountInclTax,
      source_ref_type: "stripe_invoice",
      source_ref_id: invoice.id,
      metadata: {
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: subscriptionId,
        plan_code: subscription.plan_code,
      },
    })
    .select("id")
    .single();

  if (revenueError) {
    if (revenueError.code !== "23505") {
      throw new Error(`Failed to create revenue event: ${revenueError.message}`);
    }

    const { data: existingRevenue } = await supabase
      .from("revenue_events")
      .select("id")
      .eq("event_type", "subscription_monthly")
      .eq("source_ref_type", "stripe_invoice")
      .eq("source_ref_id", invoice.id)
      .single();
    revenueEventId = existingRevenue?.id ?? null;
  } else {
    revenueEventId = insertedRevenue.id;
  }

  if (!revenueEventId) {
    logger.warn("invoice.paid: revenue event lookup failed after duplicate insert", {
      stripeInvoiceId: invoice.id,
    });
    return { skipped: true, reason: "revenue event lookup failed" };
  }

  const payoutRule = await resolveSubscriptionPayoutRule(
    supabase,
    castId,
    subscription.plan_code,
    occurredOn
  );
  if (!payoutRule) {
    logger.warn("invoice.paid: payout rule not found", {
      stripeInvoiceId: invoice.id,
      castId,
      planCode: subscription.plan_code,
    });
    return { skipped: true, reason: "payout rule not found" };
  }
  const payoutAmount = Math.floor((amountExclTax * Number(payoutRule.percent)) / 100);

  const { error: payoutError } = await supabase.from("payout_calculations").insert({
    revenue_event_id: revenueEventId,
    cast_id: castId,
    rule_id: payoutRule.id,
    percent_snapshot: payoutRule.percent,
    amount_jpy: payoutAmount,
  });

  if (payoutError && payoutError.code !== "23505") {
    throw new Error(`Failed to create payout calculation: ${payoutError.message}`);
  }

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "revenue_events",
    targetId: revenueEventId,
    success: true,
    metadata: {
      event: "invoice.paid",
      stripe_invoice_id: invoice.id,
      amount_incl_tax_jpy: amountInclTax,
      amount_excl_tax_jpy: amountExclTax,
      payout_amount_jpy: payoutAmount,
      payout_percent: payoutRule.percent,
    },
    actorStaffId: null,
  });

  return { revenueEventId, payoutAmount };
}

// invoice.payment_failed: past_due へ更新し、支払い方法更新リンク付きで通知
export async function handleInvoicePaymentFailed(
  supabase: SupabaseAdmin,
  invoice: Stripe.Invoice,
  eventType: string
) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) {
    return { skipped: true };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, end_user_id, stripe_customer_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!sub) {
    return { skipped: true };
  }

  // past_dueに更新
  // 1ユーザー1ライブ契約の一意制約(uq_subscriptions_live_per_user)に当たり得るため、
  // エラーを握りつぶさない（握りつぶすとStripeと自DBの状態が静かに食い違う）。
  const { error: pastDueError } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("id", sub.id);
  if (pastDueError) {
    logger.error("invoice.payment_failed: subscription past_due 更新に失敗", {
      subscriptionId: sub.id,
      code: pastDueError.code,
      message: pastDueError.message,
    });
  }
  await supabase.from("end_users").update({ status: "past_due" }).eq("id", sub.end_user_id);

  // 支払い方法を更新できるカスタマーポータルのリンクを用意（best-effort）
  let portalUrl: string | null = null;
  if (sub.stripe_customer_id) {
    try {
      portalUrl = await createBillingPortalSession(
        sub.stripe_customer_id,
        `${getServerEnv().APP_BASE_URL}/account/plan`
      );
    } catch (err) {
      logger.warn("invoice.payment_failed: billing portal link skipped", {
        subscriptionId: sub.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 支払い更新のお願いを LINE / メールで通知（best-effort）
  await notifyUser(supabase, sub.end_user_id, paymentFailedNotification(portalUrl));

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: sub.id,
    success: true,
    metadata: { event: eventType, new_status: "past_due" },
    actorStaffId: null,
  });

  return { subscriptionId: sub.id };
}

// charge.refunded: ポイント/ギフトはMVP対象外のため返金台帳処理は行わない
export function handleChargeRefunded(charge: Stripe.Charge) {
  const metadata = charge.metadata ?? {};
  return { skipped: true, reason: `${metadata.type ?? "unknown"} refund disabled for MVP` };
}

// customer.subscription.deleted: 解約確定（status=canceled）・リッチメニュー復帰・通知・履歴記録
export async function handleSubscriptionDeleted(
  supabase: SupabaseAdmin,
  subscription: Stripe.Subscription,
  eventType: string,
  eventId: string
) {
  const subscriptionId = subscription.id;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, end_user_id, plan_code, end_users!inner(line_user_id, assigned_cast_id)")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!sub) {
    return { skipped: true };
  }

  await supabase.from("subscriptions").update({ status: "canceled" }).eq("id", sub.id);
  await supabase
    .from("end_users")
    .update({ status: "canceled", trial_end_at: null, canceled_at: new Date().toISOString() })
    .eq("id", sub.end_user_id);

  const endUser = sub.end_users as unknown as {
    line_user_id: string;
    assigned_cast_id: string | null;
  };
  const lineUserId = endUser.line_user_id;
  if (lineUserId) {
    // 契約変更・解約導線は共通Rutin公式LINEのリッチメニューで管理する。
    // ただしリッチメニューは「人」につき1つ。複数メイト契約者が1契約だけ
    // 解約したときに未契約メニューへ戻すと、まだ支払い中の人に
    // 新規向けの契約導線が出てしまうため、他にライブ契約が残っていれば触らない。
    let hasOtherLiveContract = false;
    try {
      const personId = await getPersonIdForEndUser(supabase, sub.end_user_id);
      if (personId) {
        const otherLive = await getLiveContractedCastIds(supabase, personId);
        hasOtherLiveContract = otherLive.length > 0;
      }
    } catch (err) {
      // 判定に失敗したら「残っている」側に倒す（契約者に未契約メニューを
      // 出す害 > メニュー戻し漏れの害。戻し漏れは次の解約時に再試行される）
      hasOtherLiveContract = true;
      logger.warn("subscription.deleted: other-live check failed, keeping contracted menu", {
        endUserId: sub.end_user_id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    if (!hasOtherLiveContract) {
      const defaultAccount = await getDefaultLineAccount(supabase);
      const uncontractedMenuId = defaultAccount.richMenuUncontractedId;
      if (uncontractedMenuId) {
        try {
          await switchRichMenu(defaultAccount.credentials, lineUserId, uncontractedMenuId);
        } catch (err) {
          logger.error("Stripe webhook rich menu revert failed", {
            lineUserId,
            error: err instanceof Error ? err.message : "unknown",
          });
        }
      }
    }
  }

  // 解約完了を LINE / メールで通知（best-effort）
  await notifyUser(supabase, sub.end_user_id, subscriptionCanceledNotification());

  await recordSubscriptionLifecycleEvent(supabase, {
    endUserId: sub.end_user_id,
    castId: endUser.assigned_cast_id,
    eventType: "cancel",
    planCode: sub.plan_code,
    sourceRefType: `stripe:${eventType}`,
    sourceRefId: eventId,
    metadata: {
      stripe_subscription_id: subscriptionId,
      new_status: "canceled",
    },
  });

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: sub.id,
    success: true,
    metadata: { event: eventType, new_status: "canceled" },
    actorStaffId: null,
  });

  return { subscriptionId: sub.id };
}

// checkout.session.completed: サブスク購入完了の同期（end_user/subscription 作成・更新、副作用集約）
export async function handleCheckoutSessionCompleted(
  supabase: SupabaseAdmin,
  session: Stripe.Checkout.Session
) {
  const metadata = session.metadata ?? {};
  const type = metadata.type;

  // --------------------------------------------------
  // サブスクリプション購入完了
  // --------------------------------------------------
  if (type === "subscription" && session.subscription) {
    const lineUserId = metadata.line_user_id;
    const castId = metadata.cast_id;
    const planCode = metadata.plan_code;
    const customerId = session.customer as string;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;

    if (!lineUserId || !castId || !planCode) {
      logger.warn("checkout.session.completed: missing subscription metadata", {
        sessionId: session.id,
      });
      return { skipped: true, reason: "missing subscription metadata" };
    }

    const stripeSubscription = await fetchStripeSubscription(subscriptionId);
    const trialEndAt = trialEndAtFromSubscription(stripeSubscription);
    const currentPeriodEnd = currentPeriodEndFromStripeSubscription(stripeSubscription);
    const subscriptionStatus = toSubscriptionStatus(stripeSubscription.status);
    const subscriptionStartedAt = new Date(
      (stripeSubscription.created ?? session.created ?? Math.floor(Date.now() / 1000)) * 1000
    ).toISOString();

    // Checkout で入力された顧客メールを LINE 非依存の連絡先として取り込む
    const checkoutEmail = normalizeEmail(
      session.customer_details?.email ?? session.customer_email
    );

    // 「このメイトとの関係行」を取得または作成する。
    // 複数メイト契約では line_user_id だけでは行が一意に決まらないため、
    // 解決は lib/person.ts に一本化している（見込み行があれば昇格させて履歴を引き継ぐ）。
    const relationship = await ensureRelationshipForCast(supabase, {
      lineUserId,
      castId,
      planCode,
      personId: metadata.person_id ?? null,
    });

    const { data: existingUser } = await supabase
      .from("end_users")
      .select("id, status, email")
      .eq("id", relationship.id)
      .single();

    const user = existingUser ?? { id: relationship.id, status: subscriptionStatus, email: null };

    // 同じメイトに既にライブ契約があるなら、この完了は二重契約（レース）。
    // 関係行はメイトごとに分かれているため、別メイトの追加契約はここに来ない
    // （＝正当な追加契約を誤ってキャンセルしない）。
    const duplicate = await cancelIfDuplicateLiveSubscription(supabase, {
      endUserId: user.id,
      incomingSubscriptionId: subscriptionId,
      castId,
      planCode,
      eventType: "checkout.session.completed",
    });
    if (duplicate) {
      return { skipped: true, reason: "duplicate live subscription auto-canceled" };
    }

    await supabase
      .from("end_users")
      .update({
        ...statusPatch(subscriptionStatus),
        plan_code: planCode,
        assigned_cast_id: castId,
        trial_end_at: trialEndAt,
        ...(relationship.isNew ? { line_followed_at: subscriptionStartedAt } : {}),
        ...(subscriptionStatus === "trial"
          ? { trial_started_at: subscriptionStartedAt }
          : { subscribed_at: subscriptionStartedAt }),
      })
      .eq("id", user.id);

    // メール取り込みは best-effort（未登録時のみ・衝突時は無視）。
    // サブスク同期本体をメール一意制約違反で失敗させない。
    if (checkoutEmail && !user.email) {
      const { error: emailErr } = await supabase
        .from("end_users")
        .update({ email: checkoutEmail })
        .eq("id", user.id)
        .is("email", null);
      if (emailErr) {
        logger.warn("checkout.session.completed: email capture skipped", {
          endUserId: user.id,
          message: emailErr.message,
        });
      }
    }

    const billingInterval = metadata.billing_interval === "year" ? "year" : "month";

    const { error: subError } = await supabase.from("subscriptions").insert({
      end_user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: subscriptionStatus,
      plan_code: planCode,
      applied_stripe_price_id: metadata.stripe_price_id ?? "",
      billing_interval: billingInterval,
      current_period_end: currentPeriodEnd,
    });

    if (subError && subError.code !== "23505") {
      throw new Error(`Failed to create subscription: ${subError.message}`);
    } else if (subError?.code === "23505") {
      // 23505 には2種類ある。制約名の文字列に依存せず、同じ subscription_id の行が
      // 実在するかで判別する（存在しない＝uq_subscriptions_live_per_user 違反）。
      const conflict = await resolveSubscriptionInsertConflict(supabase, {
        endUserId: user.id,
        subscriptionId,
        castId,
        planCode,
        eventType: "checkout.session.completed",
      });

      if (conflict === "duplicate_live") {
        return { skipped: true, reason: "duplicate live subscription auto-canceled" };
      }

      await supabase
        .from("subscriptions")
        .update({
          ...statusPatch(subscriptionStatus),
          applied_stripe_price_id: metadata.stripe_price_id ?? "",
          billing_interval: billingInterval,
          ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
        })
        .eq("stripe_subscription_id", subscriptionId);
    }

    await recordSubscriptionLifecycleEvent(supabase, {
      endUserId: user.id,
      castId,
      eventType: subscriptionStatus === "trial" ? "trial_start" : "subscribe",
      planCode,
      occurredAt: subscriptionStartedAt,
      sourceRefType: "stripe:subscription_initial",
      sourceRefId: subscriptionId,
      metadata: {
        stripe_checkout_session_id: session.id,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        status: subscriptionStatus,
        trial_end_at: trialEndAt,
      },
    });

    await syncNewSubscriptionSideEffects(supabase, {
      endUserId: user.id,
      lineUserId,
      castId,
      stripeSubscriptionId: subscriptionId,
      planCode,
      status: subscriptionStatus,
      trialEndAt,
    });

    // 同時申込レースでの定員超過を検知（決済済みのため割当は維持、運用へ通知）
    await warnIfCastOverCapacity(supabase, castId);

    // 運営向けの新規会員通知は syncNewSubscriptionSideEffects のclaimゲートの中で送る。
    // ここ（INSERTに勝った側だけ）で送ると、customer.subscription.created が先に
    // INSERTした場合に通知が1回も飛ばない（あちらの経路には通知呼び出しが無かった）。

    // 監査ログ
    await writeAuditLog({
      action: "SUBSCRIPTION_SYNC",
      targetType: "subscriptions",
      targetId: subscriptionId,
      success: true,
      metadata: {
        event: "checkout.session.completed",
        line_user_id: lineUserId,
        cast_id: castId,
        plan_code: planCode,
      },
      actorStaffId: null,
    });

    return { type: "subscription", userId: user.id };
  }

  // --------------------------------------------------
  // ポイント購入完了
  // --------------------------------------------------
  if (type === "point_purchase") {
    return { skipped: true, reason: "point purchase disabled for MVP" };
  }

  return { type: "unknown" };
}

// customer.subscription.created / updated: 状態同期（pause反映・新規フォールバック作成・解約予約/トライアル転換/プラン変更の記録）
export async function handleSubscriptionUpsert(
  supabase: SupabaseAdmin,
  subscription: Stripe.Subscription,
  eventType: string,
  eventId: string
) {
  const subscriptionId = subscription.id;
  // pause_collection が設定されている場合はアプリ上のステータスを paused にする
  // （Stripe の status は active のままのため、pause_collection の有無で判定する）
  const isPaused = Boolean(subscription.pause_collection);
  const newStatus = isPaused ? "paused" : toSubscriptionStatus(subscription.status);
  const currentPeriodEnd = currentPeriodEndFromStripeSubscription(subscription);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const appliedStripePriceId = subscription.items.data[0]?.price?.id ?? null;
  // 請求間隔は Stripe の Price から権威的に取得する（メタデータより確実）
  const billingInterval =
    subscription.items.data[0]?.price?.recurring?.interval === "year" ? "year" : "month";
  const subscriptionStartedAt = new Date(
    (subscription.created ?? Math.floor(Date.now() / 1000)) * 1000
  ).toISOString();

  // サブスクリプションを検索
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, end_user_id, status, plan_code, cancel_at_period_end, end_users!inner(assigned_cast_id)")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!sub) {
    // 行が無い場合の作成フォールバック。
    // 以前は customer.subscription.created だけが行を作れたが、Stripeのイベントは
    // 到着順が保証されない。実例（2026-08-20 ゆい契約）:
    //   04:01:14.9 updated(incomplete→active) ← 最初に届き「行が無い」でスキップ
    //   04:01:15.0 checkout.session.completed ← 支払い確定前に取得した incomplete で行を作成
    //   04:01:16.0 created ← payload の status も incomplete
    // → active への遷移を運ぶイベントが消費済みになり、契約が incomplete のまま
    //   永遠に取り残された（会員は課金されているのに未契約扱い）。
    // metadata が揃っていればイベント種別を問わず作成し、到着順への依存を断つ。
    const metadata = subscription.metadata ?? {};
    const lineUserId = metadata.line_user_id;
    const castId = metadata.cast_id;
    const planCode = metadata.plan_code;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    if (!lineUserId || !castId || !planCode || !customerId || !appliedStripePriceId) {
      // 旧サブスク・外部作成など metadata の無いものはここで止まる（作らない）
      logger.warn(`${eventType}: missing metadata, cannot create subscription row`, {
        subscriptionId,
      });
      return { skipped: true, reason: "missing subscription metadata" };
    }

    // checkout.session.completed と同じく「このメイトとの関係行」で解決する
    // （どちらのイベントが先に届いても同じ行に着地する）。
    const relationship = await ensureRelationshipForCast(supabase, {
      lineUserId,
      castId,
      planCode,
      personId: metadata.person_id ?? null,
    });
    const user = { id: relationship.id };

    const trialEndAt = trialEndAtFromSubscription(subscription);

    // 同じメイトに既にライブ契約があるなら二重契約（レース）。
    // 別メイトの追加契約は関係行が分かれるためここに来ない。
    const duplicate = await cancelIfDuplicateLiveSubscription(supabase, {
      endUserId: user.id,
      incomingSubscriptionId: subscriptionId,
      castId,
      planCode,
      eventType: "customer.subscription.created",
    });
    if (duplicate) {
      return { skipped: true, reason: "duplicate live subscription auto-canceled" };
    }

    await supabase
      .from("end_users")
      .update({
        ...statusPatch(newStatus),
        plan_code: planCode,
        assigned_cast_id: castId,
        trial_end_at: trialEndAt,
        ...(relationship.isNew ? { line_followed_at: subscriptionStartedAt } : {}),
        ...(newStatus === "trial"
          ? { trial_started_at: subscriptionStartedAt }
          : { subscribed_at: subscriptionStartedAt }),
      })
      .eq("id", user.id);

    const { error: insertError } = await supabase.from("subscriptions").insert({
      end_user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: newStatus,
      plan_code: planCode,
      applied_stripe_price_id: appliedStripePriceId,
      billing_interval: billingInterval,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    if (insertError && insertError.code !== "23505") {
      throw new Error(`Failed to create subscription: ${insertError.message}`);
    }

    if (insertError?.code === "23505") {
      const conflict = await resolveSubscriptionInsertConflict(supabase, {
        endUserId: user.id,
        subscriptionId,
        castId,
        planCode,
        eventType: "customer.subscription.created",
      });

      if (conflict === "duplicate_live") {
        return { skipped: true, reason: "duplicate live subscription auto-canceled" };
      }

      await supabase
        .from("subscriptions")
        .update({
          ...statusPatch(newStatus),
          cancel_at_period_end: cancelAtPeriodEnd,
          applied_stripe_price_id: appliedStripePriceId,
          billing_interval: billingInterval,
          ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
        })
        .eq("stripe_subscription_id", subscriptionId);
    }

    await recordSubscriptionLifecycleEvent(supabase, {
      endUserId: user.id,
      castId,
      eventType: newStatus === "trial" ? "trial_start" : "subscribe",
      planCode,
      occurredAt: subscriptionStartedAt,
      sourceRefType: "stripe:subscription_initial",
      sourceRefId: subscriptionId,
      metadata: {
        stripe_event_id: eventId,
        stripe_subscription_id: subscriptionId,
        status: newStatus,
        trial_end_at: trialEndAt,
        synced_from: "subscription.created",
      },
    });

    await syncNewSubscriptionSideEffects(supabase, {
      endUserId: user.id,
      lineUserId,
      castId,
      stripeSubscriptionId: subscriptionId,
      planCode,
      status: newStatus,
      trialEndAt,
    });

    // 同時申込レースでの定員超過を検知（決済済みのため割当は維持、運用へ通知）
    await warnIfCastOverCapacity(supabase, castId);

    await writeAuditLog({
      action: "SUBSCRIPTION_SYNC",
      targetType: "subscriptions",
      targetId: subscriptionId,
      success: true,
      metadata: {
        event: eventType,
        new_status: newStatus,
        synced_from: "subscription.created",
      },
      actorStaffId: null,
    });

    return { subscriptionId, newStatus, created: true };
  }

  const previousStatus = sub.status;
  const trialEndAt = trialEndAtFromSubscription(subscription);

  // plan_code 同期: Stripe メタデータ優先、無ければ price ID から逆引き
  const metadataPlanCode = subscription.metadata?.plan_code;
  let planCodeToSync: string | null =
    metadataPlanCode && PLAN_CODES.includes(metadataPlanCode as (typeof PLAN_CODES)[number])
      ? metadataPlanCode
      : null;

  if (!planCodeToSync && appliedStripePriceId) {
    const { data: euForPlan } = await supabase
      .from("end_users")
      .select("assigned_cast_id")
      .eq("id", sub.end_user_id)
      .maybeSingle();
    // 月額/年額の両方を解決して price ID から plan_code を逆引きする
    planCodeToSync = await resolvePlanCodeFromAppliedPrice(
      supabase,
      euForPlan?.assigned_cast_id ?? null,
      appliedStripePriceId
    );
  }

  const planChanged = Boolean(planCodeToSync && planCodeToSync !== sub.plan_code);
  const trialConverted = previousStatus === "trial" && newStatus === "active";

  // 解約済み→ライブへの復帰などで一意制約(uq_subscriptions_live_per_user)に当たり得る。
  // 握りつぶすと「Stripeは課金中なのに自DBは解約済み」のまま静かにズレるため、必ず記録する。
  const { error: syncError } = await supabase
    .from("subscriptions")
    .update({
      ...statusPatch(newStatus),
      cancel_at_period_end: cancelAtPeriodEnd,
      billing_interval: billingInterval,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
      ...(appliedStripePriceId ? { applied_stripe_price_id: appliedStripePriceId } : {}),
      ...(planCodeToSync ? { plan_code: planCodeToSync } : {}),
    })
    .eq("id", sub.id);

  if (syncError) {
    logger.error("subscription sync 更新に失敗", {
      subscriptionId: sub.id,
      newStatus,
      code: syncError.code,
      message: syncError.message,
    });
    if (syncError.code === "23505") {
      // 同一ユーザーに既にライブ契約がある＝二重契約の疑い。運営が気づけるようにする。
      await writeAuditLog({
        action: "SUBSCRIPTION_DUPLICATE_CANCELED",
        targetType: "subscriptions",
        targetId: sub.id,
        success: false,
        metadata: {
          reason: "live_subscription_conflict_on_status_sync",
          end_user_id: sub.end_user_id,
          attempted_status: newStatus,
          event: eventType,
        },
        actorStaffId: null,
      });
    }
  }

  const endUser = sub.end_users as unknown as { assigned_cast_id: string | null };
  const castId = endUser.assigned_cast_id;
  const lifecycleUserUpdate = {
    ...statusPatch(newStatus),
    ...(trialEndAt ? { trial_end_at: trialEndAt } : {}),
    ...(trialConverted ? { subscribed_at: new Date().toISOString() } : {}),
    ...(planCodeToSync ? { plan_code: planCodeToSync } : {}),
  };

  await supabase.from("end_users").update(lifecycleUserUpdate).eq("id", sub.end_user_id);

  // 解約予約が新たに入った場合（false→true）に期間終了日を案内（best-effort）
  const cancelNewlyScheduled =
    !sub.cancel_at_period_end && cancelAtPeriodEnd && newStatus !== "canceled";
  if (cancelNewlyScheduled) {
    await notifyUser(supabase, sub.end_user_id, cancelScheduledNotification(currentPeriodEnd));
    await recordSubscriptionLifecycleEvent(supabase, {
      endUserId: sub.end_user_id,
      castId,
      eventType: "cancel_scheduled",
      planCode: planCodeToSync ?? sub.plan_code,
      sourceRefType: `stripe:${eventType}:cancel_scheduled`,
      sourceRefId: eventId,
      metadata: {
        stripe_subscription_id: subscriptionId,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
      },
    });
  }

  if (trialConverted) {
    await recordSubscriptionLifecycleEvent(supabase, {
      endUserId: sub.end_user_id,
      castId,
      eventType: "subscribe",
      planCode: planCodeToSync ?? sub.plan_code,
      sourceRefType: `stripe:${eventType}:trial_converted`,
      sourceRefId: eventId,
      metadata: {
        stripe_subscription_id: subscriptionId,
        previous_status: previousStatus,
        new_status: newStatus,
      },
    });
  }

  if (planChanged) {
    await recordSubscriptionLifecycleEvent(supabase, {
      endUserId: sub.end_user_id,
      castId,
      eventType: "plan_change",
      planCode: planCodeToSync,
      sourceRefType: `stripe:${eventType}:plan_change`,
      sourceRefId: eventId,
      metadata: {
        stripe_subscription_id: subscriptionId,
        previous_plan_code: sub.plan_code,
        new_plan_code: planCodeToSync,
      },
    });
  }

  await writeAuditLog({
    action: "SUBSCRIPTION_SYNC",
    targetType: "subscriptions",
    targetId: sub.id,
    success: true,
    metadata: {
      event: eventType,
      previous_status: previousStatus,
      new_status: newStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      ...(trialConverted ? { trial_converted: true } : {}),
      ...(cancelNewlyScheduled ? { cancel_scheduled: true } : {}),
      ...(planChanged
        ? { plan_changed: true, previous_plan_code: sub.plan_code, new_plan_code: planCodeToSync }
        : {}),
    },
    actorStaffId: null,
  });

  return { subscriptionId: sub.id, newStatus };
}

export async function POST(request: Request) {
  const allowed = await checkRateLimit({
    key: requestKey(request, "stripe_webhook"),
    windowMs: 60_000,
    maxRequests: 120,
  });
  if (!allowed) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  // 署名検証
  const event = verifyStripeSignature(payload, signature);
  if (!event) {
    return new Response("Invalid signature", { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const eventId = event.id;
  const eventType = event.type;

  // =====================================================
  // checkout.session.completed - サブスク購入/ポイント購入
  // =====================================================
  if (eventType === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, () =>
      handleCheckoutSessionCompleted(supabase, session)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.created / updated - サブスク状態同期
  // =====================================================
  if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, () =>
      handleSubscriptionUpsert(supabase, subscription, eventType, eventId)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.deleted - サブスク解約
  // =====================================================
  if (eventType === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, () =>
      handleSubscriptionDeleted(supabase, subscription, eventType, eventId)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.trial_will_end - トライアル終了予告
  // → 解約率増加につながるため、ユーザーへの「トライアル終了予告」通知は意図的に送らない。
  //   （Stripe からイベントが届いても何もしない）
  // =====================================================

  // =====================================================
  // invoice.paid - サブスク売上認識・配分計算
  // =====================================================
  if (eventType === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () =>
      recognizeSubscriptionRevenue(supabase, invoice)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // invoice.payment_failed - 支払い失敗
  // =====================================================
  if (eventType === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, () =>
      handleInvoicePaymentFailed(supabase, invoice, eventType)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // charge.refunded - 返金
  // =====================================================
  if (eventType === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () =>
      handleChargeRefunded(charge)
    );

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  return Response.json({ received: true });
}
