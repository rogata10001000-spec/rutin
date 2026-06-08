import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const STRIPE_SECRET_KEY = getServerEnv().STRIPE_SECRET_KEY;

export const stripe = new Stripe(STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
});

/**
 * Stripe署名検証
 */
export function verifyStripeSignature(
  payload: string,
  signature: string | null
): Stripe.Event | null {
  const secret = getServerEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) {
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    logger.error("Stripe signature verification failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * サブスクリプションステータスの変換
 */
export function toSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete" {
  switch (stripeStatus) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "incomplete";
  }
}

/**
 * Checkout Session作成（サブスクリプション用）
 */
export async function createSubscriptionCheckout(params: {
  lineUserId: string;
  castId: string;
  planCode: string;
  stripePriceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
}): Promise<{ url: string | null; sessionId: string }> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: params.stripePriceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: params.trialPeriodDays,
      metadata: {
        line_user_id: params.lineUserId,
        cast_id: params.castId,
        plan_code: params.planCode,
        stripe_price_id: params.stripePriceId,
      },
    },
    metadata: {
      line_user_id: params.lineUserId,
      cast_id: params.castId,
      plan_code: params.planCode,
      stripe_price_id: params.stripePriceId,
      type: "subscription",
    },
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
}

/**
 * サブスクリプションのプラン（Price）を変更する。
 * proration_behavior: "none" のため、新価格は次回請求サイクルから反映される。
 */
export async function updateSubscriptionPlanPrice(params: {
  subscriptionId: string;
  newStripePriceId: string;
  planCode: string;
}): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    throw new Error("Subscription has no items to update");
  }

  return stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: itemId, price: params.newStripePriceId }],
    proration_behavior: "none",
    metadata: {
      ...subscription.metadata,
      plan_code: params.planCode,
      stripe_price_id: params.newStripePriceId,
    },
  });
}

/**
 * 期間終了時解約のオン/オフを切り替える。
 * cancelAtPeriodEnd=true で次回更新日に自動終了、false で解約予定を取り消す。
 */
export async function setSubscriptionCancelAtPeriodEnd(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

/**
 * Checkout Session作成（ポイント購入用）
 */
export async function createPointCheckout(params: {
  lineUserId: string;
  stripePriceId: string;
  points: number;
  productId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string | null; sessionId: string }> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: params.stripePriceId,
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        line_user_id: params.lineUserId,
        product_id: params.productId,
        points: params.points.toString(),
        type: "point_purchase",
      },
    },
    metadata: {
      line_user_id: params.lineUserId,
      product_id: params.productId,
      points: params.points.toString(),
      type: "point_purchase",
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
}
