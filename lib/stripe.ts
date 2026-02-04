import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set");
}

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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) {
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.error("[Stripe] Signature verification failed:", err);
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
      },
    },
    metadata: {
      line_user_id: params.lineUserId,
      cast_id: params.castId,
      plan_code: params.planCode,
      type: "subscription",
    },
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
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
