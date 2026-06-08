import Stripe from "stripe";
import { verifyStripeSignature, toSubscriptionStatus } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { withWebhookIdempotency } from "@/lib/webhook";
import { writeAuditLog } from "@/lib/audit";
import { switchRichMenu } from "@/lib/line";
import { checkRateLimit, requestKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import {
  endUserNicknameFromLineId,
  fetchStripeSubscription,
  syncNewSubscriptionSideEffects,
  trialEndAtFromSubscription,
} from "@/lib/stripe-subscription-sync";
import type { PayoutScopeType } from "@/lib/supabase/types";
import {
  PLAN_CODES,
  resolveCastPlanPricing,
  planCodeFromStripePriceId,
} from "@/lib/plan-pricing";
import { normalizeEmail } from "@/lib/email-address";
import { notifyUser } from "@/lib/notifications";
import {
  paymentFailedNotification,
  subscriptionCanceledNotification,
  cancelScheduledNotification,
  trialWillEndNotification,
} from "@/lib/notification-templates";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

function stripeWebhookErrorResponse(eventType: string, eventId: string, message: string) {
  logger.error("Stripe webhook processing error", { eventType, eventId, message });
  return Response.json(
    { received: false, error: "processing_failed" },
    { status: 500 }
  );
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const rawSubscription = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (!rawSubscription) return null;
  return typeof rawSubscription === "string" ? rawSubscription : rawSubscription.id;
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
    .select("id, end_user_id, plan_code, end_users!inner(assigned_cast_id)")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!subscription) {
    logger.warn("invoice.paid: subscription row not found", {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId,
    });
    return { skipped: true, reason: "subscription not found in database" };
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

export async function POST(request: Request) {
  const allowed = checkRateLimit({
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

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
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
        const currentPeriodEnd = stripeSubscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
          : null;
        const subscriptionStatus = toSubscriptionStatus(stripeSubscription.status);

        // Checkout で入力された顧客メールを LINE 非依存の連絡先として取り込む
        const checkoutEmail = normalizeEmail(
          session.customer_details?.email ?? session.customer_email
        );

        // end_user取得または作成
        let { data: user } = await supabase
          .from("end_users")
          .select("id, status, email")
          .eq("line_user_id", lineUserId)
          .single();

        if (!user) {
          const { data: newUser, error } = await supabase
            .from("end_users")
            .insert({
              line_user_id: lineUserId,
              nickname: endUserNicknameFromLineId(lineUserId),
              status: subscriptionStatus,
              plan_code: planCode,
              assigned_cast_id: castId,
              trial_end_at: trialEndAt,
            })
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to create end_user: ${error.message}`);
          }
          user = { id: newUser.id, status: subscriptionStatus, email: null };
        } else {
          await supabase
            .from("end_users")
            .update({
              status: subscriptionStatus,
              plan_code: planCode,
              assigned_cast_id: castId,
              trial_end_at: trialEndAt,
            })
            .eq("id", user.id);
        }

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

        const { error: subError } = await supabase.from("subscriptions").insert({
          end_user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: subscriptionStatus,
          plan_code: planCode,
          applied_stripe_price_id: metadata.stripe_price_id ?? "",
          current_period_end: currentPeriodEnd,
        });

        if (subError && subError.code !== "23505") {
          throw new Error(`Failed to create subscription: ${subError.message}`);
        } else if (subError?.code === "23505") {
          await supabase
            .from("subscriptions")
            .update({
              status: subscriptionStatus,
              current_period_end: currentPeriodEnd,
              applied_stripe_price_id: metadata.stripe_price_id ?? "",
            })
            .eq("stripe_subscription_id", subscriptionId);
        }

        await syncNewSubscriptionSideEffects(supabase, {
          endUserId: user.id,
          lineUserId,
          castId,
          trialEndAt,
        });

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
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.created / updated - サブスク状態同期
  // =====================================================
  if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const subscriptionId = subscription.id;
      const newStatus = toSubscriptionStatus(subscription.status);
      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      const cancelAtPeriodEnd = subscription.cancel_at_period_end;
      const appliedStripePriceId = subscription.items.data[0]?.price?.id ?? null;

      // サブスクリプションを検索
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_user_id, status, plan_code, cancel_at_period_end")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (!sub) {
        if (eventType !== "customer.subscription.created") {
          console.warn(`[Stripe Webhook] Subscription not found: ${subscriptionId}`);
          return { skipped: true };
        }

        const metadata = subscription.metadata ?? {};
        const lineUserId = metadata.line_user_id;
        const castId = metadata.cast_id;
        const planCode = metadata.plan_code;
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;

        if (!lineUserId || !castId || !planCode || !customerId || !appliedStripePriceId) {
          logger.warn("customer.subscription.created: missing metadata", {
            subscriptionId,
          });
          return { skipped: true, reason: "missing subscription metadata" };
        }

        let { data: user } = await supabase
          .from("end_users")
          .select("id")
          .eq("line_user_id", lineUserId)
          .single();

        const trialEndAt = trialEndAtFromSubscription(subscription);

        if (!user) {
          const { data: newUser, error: userCreateError } = await supabase
            .from("end_users")
            .insert({
              line_user_id: lineUserId,
              nickname: endUserNicknameFromLineId(lineUserId),
              status: newStatus,
              plan_code: planCode,
              assigned_cast_id: castId,
              trial_end_at: trialEndAt,
            })
            .select("id")
            .single();

          if (userCreateError) {
            throw new Error(`Failed to create end_user: ${userCreateError.message}`);
          }
          user = { id: newUser.id };
        } else {
          await supabase
            .from("end_users")
            .update({
              status: newStatus,
              plan_code: planCode,
              assigned_cast_id: castId,
              trial_end_at: trialEndAt,
            })
            .eq("id", user.id);
        }

        const { error: insertError } = await supabase.from("subscriptions").insert({
          end_user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: newStatus,
          plan_code: planCode,
          applied_stripe_price_id: appliedStripePriceId,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
        });

        if (insertError && insertError.code !== "23505") {
          throw new Error(`Failed to create subscription: ${insertError.message}`);
        }

        if (insertError?.code === "23505") {
          await supabase
            .from("subscriptions")
            .update({
              status: newStatus,
              current_period_end: currentPeriodEnd,
              cancel_at_period_end: cancelAtPeriodEnd,
              applied_stripe_price_id: appliedStripePriceId,
            })
            .eq("stripe_subscription_id", subscriptionId);
        }

        await syncNewSubscriptionSideEffects(supabase, {
          endUserId: user.id,
          lineUserId,
          castId,
          trialEndAt,
        });

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
        const pricing = await resolveCastPlanPricing(
          supabase,
          euForPlan?.assigned_cast_id ?? null
        );
        planCodeToSync = planCodeFromStripePriceId(pricing, appliedStripePriceId);
      }

      const planChanged = Boolean(planCodeToSync && planCodeToSync !== sub.plan_code);

      await supabase
        .from("subscriptions")
        .update({
          status: newStatus,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
          ...(appliedStripePriceId ? { applied_stripe_price_id: appliedStripePriceId } : {}),
          ...(planCodeToSync ? { plan_code: planCodeToSync } : {}),
        })
        .eq("id", sub.id);

      await supabase
        .from("end_users")
        .update({
          status: newStatus,
          ...(trialEndAt ? { trial_end_at: trialEndAt } : {}),
          ...(planCodeToSync ? { plan_code: planCodeToSync } : {}),
        })
        .eq("id", sub.end_user_id);

      const trialConverted = previousStatus === "trial" && newStatus === "active";

      // 解約予約が新たに入った場合（false→true）に期間終了日を案内（best-effort）
      const cancelNewlyScheduled =
        !sub.cancel_at_period_end && cancelAtPeriodEnd && newStatus !== "canceled";
      if (cancelNewlyScheduled) {
        await notifyUser(
          supabase,
          sub.end_user_id,
          cancelScheduledNotification(currentPeriodEnd)
        );
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
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.deleted - サブスク解約
  // =====================================================
  if (eventType === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const subscriptionId = subscription.id;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_user_id, end_users!inner(line_user_id)")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (!sub) {
        return { skipped: true };
      }

      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("id", sub.id);

      await supabase
        .from("end_users")
        .update({ status: "canceled", trial_end_at: null })
        .eq("id", sub.end_user_id);

      const lineUserId = (sub.end_users as unknown as { line_user_id: string }).line_user_id;
      const uncontractedMenuId = getServerEnv().RICH_MENU_ID_UNCONTRACTED;
      if (lineUserId && uncontractedMenuId) {
        try {
          await switchRichMenu(lineUserId, uncontractedMenuId);
        } catch (err) {
          logger.error("Stripe webhook rich menu revert failed", {
            lineUserId,
            error: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      // 解約完了を LINE / メールで通知（best-effort）
      await notifyUser(supabase, sub.end_user_id, subscriptionCanceledNotification());

      // 監査ログ
      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: sub.id,
        success: true,
        metadata: { event: eventType, new_status: "canceled" },
        actorStaffId: null,
      });

      return { subscriptionId: sub.id };
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // customer.subscription.trial_will_end - トライアル終了予告
  // =====================================================
  if (eventType === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_user_id")
        .eq("stripe_subscription_id", subscription.id)
        .single();

      if (!sub) {
        return { skipped: true };
      }

      const trialEndIso = subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null;

      await notifyUser(supabase, sub.end_user_id, trialWillEndNotification(trialEndIso));

      return { subscriptionId: sub.id };
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

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

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (!subscriptionId) {
        return { skipped: true };
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (!sub) {
        return { skipped: true };
      }

      // past_dueに更新
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.id);

      await supabase
        .from("end_users")
        .update({ status: "past_due" })
        .eq("id", sub.end_user_id);

      // 支払い更新のお願いを LINE / メールで通知（best-effort）
      await notifyUser(supabase, sub.end_user_id, paymentFailedNotification());

      // 監査ログ
      await writeAuditLog({
        action: "SUBSCRIPTION_SYNC",
        targetType: "subscriptions",
        targetId: sub.id,
        success: true,
        metadata: { event: eventType, new_status: "past_due" },
        actorStaffId: null,
      });

      return { subscriptionId: sub.id };
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  // =====================================================
  // charge.refunded - 返金
  // =====================================================
  if (eventType === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      // ポイント/ギフトはMVP対象外のため、返金台帳処理は行わない
      const metadata = charge.metadata ?? {};
      return { skipped: true, reason: `${metadata.type ?? "unknown"} refund disabled for MVP` };
    });

    if (result.status === "error") {
      return stripeWebhookErrorResponse(eventType, eventId, result.message);
    }
  }

  return Response.json({ received: true });
}
