import Stripe from "stripe";
import { verifyStripeSignature, toSubscriptionStatus } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { withWebhookIdempotency } from "@/lib/webhook";
import { writeAuditLog } from "@/lib/audit";
import { switchRichMenu } from "@/lib/line";
import { checkRateLimit, requestKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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
          throw new Error("Missing metadata for subscription");
        }

        // end_user取得または作成
        let { data: user } = await supabase
          .from("end_users")
          .select("id, status")
          .eq("line_user_id", lineUserId)
          .single();

        if (!user) {
          const { data: newUser, error } = await supabase
            .from("end_users")
            .insert({
              line_user_id: lineUserId,
              nickname: `ユーザー_${lineUserId.slice(-6)}`,
              status: "trial",
              plan_code: planCode,
              assigned_cast_id: castId,
            })
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to create end_user: ${error.message}`);
          }
          user = { id: newUser.id, status: "trial" };
        } else {
          // 既存ユーザーの更新
          await supabase
            .from("end_users")
            .update({
              status: "trial",
              plan_code: planCode,
              assigned_cast_id: castId,
            })
            .eq("id", user.id);
        }

        // サブスクリプション作成
        const { error: subError } = await supabase.from("subscriptions").insert({
          end_user_id: user.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: "trial",
          plan_code: planCode,
          applied_stripe_price_id: metadata.stripe_price_id ?? "",
        });

        if (subError && subError.code !== "23505") {
          throw new Error(`Failed to create subscription: ${subError.message}`);
        }

        // 担当キャスト割当履歴
        await supabase.from("cast_assignments").insert({
          end_user_id: user.id,
          from_cast_id: null,
          to_cast_id: castId,
          reason: "初回契約",
          created_by: castId,
        });

        // リッチメニュー切替（契約者用）
        const richMenuId = process.env.RICH_MENU_ID_CONTRACTED;
        if (richMenuId) {
          try {
            await switchRichMenu(lineUserId, richMenuId);
          } catch (err) {
            logger.error("Stripe webhook rich menu switch failed", {
              lineUserId,
              error: err instanceof Error ? err.message : "unknown",
            });
          }
        }

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
        const lineUserId = metadata.line_user_id;
        const productId = metadata.product_id;
        const points = parseInt(metadata.points ?? "0", 10);

        if (!lineUserId || !productId || !points) {
          throw new Error("Missing metadata for point purchase");
        }

        // end_user取得
        const { data: user } = await supabase
          .from("end_users")
          .select("id")
          .eq("line_user_id", lineUserId)
          .single();

        if (!user) {
          throw new Error("User not found for point purchase");
        }

        // ポイント台帳に追加（冪等: unique制約で重複防止）
        const { error: ledgerError } = await supabase.from("user_point_ledger").insert({
          end_user_id: user.id,
          delta_points: points,
          reason: "purchase",
          ref_type: "stripe_checkout",
          ref_id: session.id,
        });

        if (ledgerError && ledgerError.code !== "23505") {
          throw new Error(`Failed to add points: ${ledgerError.message}`);
        }

        // 監査ログ
        await writeAuditLog({
          action: "POINT_PURCHASE_CONFIRMED",
          targetType: "user_point_ledger",
          targetId: session.id,
          success: true,
          metadata: {
            line_user_id: lineUserId,
            product_id: productId,
            points,
          },
          actorStaffId: null,
        });

        return { type: "point_purchase", userId: user.id, points };
      }

      return { type: "unknown" };
    });

    if (result.status === "error") {
      logger.error("Stripe webhook checkout error", { message: result.message, eventId });
    }
  }

  // =====================================================
  // customer.subscription.updated - サブスク状態変更
  // =====================================================
  if (eventType === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const subscriptionId = subscription.id;
      const newStatus = toSubscriptionStatus(subscription.status);
      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      const cancelAtPeriodEnd = subscription.cancel_at_period_end;

      // サブスクリプションを検索
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_user_id, status")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (!sub) {
        console.warn(`[Stripe Webhook] Subscription not found: ${subscriptionId}`);
        return { skipped: true };
      }

      const previousStatus = sub.status;

      // サブスクリプション更新
      await supabase
        .from("subscriptions")
        .update({
          status: newStatus,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
        })
        .eq("id", sub.id);

      // end_userのstatusも更新
      await supabase
        .from("end_users")
        .update({ status: newStatus })
        .eq("id", sub.end_user_id);

      // 監査ログ
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
        },
        actorStaffId: null,
      });

      return { subscriptionId: sub.id, newStatus };
    });

    if (result.status === "error") {
      logger.error("Stripe webhook subscription update error", { message: result.message, eventId });
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
        .select("id, end_user_id")
        .eq("stripe_subscription_id", subscriptionId)
        .single();

      if (!sub) {
        return { skipped: true };
      }

      // サブスクリプション・ユーザーをcanceledに
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("id", sub.id);

      await supabase
        .from("end_users")
        .update({ status: "canceled" })
        .eq("id", sub.end_user_id);

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
      logger.error("Stripe webhook subscription delete error", { message: result.message, eventId });
    }
  }

  // =====================================================
  // invoice.payment_failed - 支払い失敗
  // =====================================================
  if (eventType === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      const subscriptionId = invoice.subscription as string | null;
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
      logger.error("Stripe webhook payment failed error", { message: result.message, eventId });
    }
  }

  // =====================================================
  // charge.refunded - 返金
  // =====================================================
  if (eventType === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;

    const result = await withWebhookIdempotency("stripe", eventId, eventType, async () => {
      // ポイント購入の返金の場合、台帳から相殺
      const metadata = charge.metadata ?? {};
      if (metadata.type !== "point_purchase") {
        return { skipped: true, reason: "Not a point purchase" };
      }

      const lineUserId = metadata.line_user_id;
      const points = parseInt(metadata.points ?? "0", 10);

      const { data: user } = await supabase
        .from("end_users")
        .select("id")
        .eq("line_user_id", lineUserId)
        .single();

      if (!user || !points) {
        return { skipped: true };
      }

      // 相殺エントリ
      const { error: ledgerError } = await supabase.from("user_point_ledger").insert({
        end_user_id: user.id,
        delta_points: -points,
        reason: "refund",
        ref_type: "stripe_charge_refund",
        ref_id: charge.id,
      });

      if (ledgerError && ledgerError.code !== "23505") {
        throw new Error(`Failed to process refund: ${ledgerError.message}`);
      }

      // 監査ログ
      await writeAuditLog({
        action: "REFUND_OR_CHARGEBACK_HANDLED",
        targetType: "user_point_ledger",
        targetId: charge.id,
        success: true,
        metadata: { reason: "refund", points: -points },
        actorStaffId: null,
      });

      return { refunded: true, points: -points };
    });

    if (result.status === "error") {
      logger.error("Stripe webhook refund error", { message: result.message, eventId });
    }
  }

  return Response.json({ received: true });
}
