import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { switchRichMenu } from "@/lib/line";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import { endUserNicknameFromLineId } from "@/lib/line-onboarding";
import type { createAdminSupabaseClient } from "@/lib/supabase/server";

export { endUserNicknameFromLineId };

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export function trialEndAtFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  if (subscription.trial_end) {
    return new Date(subscription.trial_end * 1000).toISOString();
  }
  return null;
}

export async function fetchStripeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId);
}

/** 初回契約時の担当割当・リッチメニュー（冪等） */
export async function syncNewSubscriptionSideEffects(
  supabase: SupabaseAdmin,
  params: {
    endUserId: string;
    lineUserId: string;
    castId: string;
    trialEndAt?: string | null;
  }
): Promise<void> {
  if (params.trialEndAt) {
    await supabase
      .from("end_users")
      .update({ trial_end_at: params.trialEndAt })
      .eq("id", params.endUserId);
  }

  const { data: existingAssignment } = await supabase
    .from("cast_assignments")
    .select("id")
    .eq("end_user_id", params.endUserId)
    .eq("to_cast_id", params.castId)
    .eq("reason", "初回契約")
    .limit(1)
    .maybeSingle();

  if (!existingAssignment) {
    await supabase.from("cast_assignments").insert({
      end_user_id: params.endUserId,
      from_cast_id: null,
      to_cast_id: params.castId,
      reason: "初回契約",
      created_by: params.castId,
    });
  }

  const richMenuId = getServerEnv().RICH_MENU_ID_CONTRACTED;
  if (richMenuId) {
    try {
      await switchRichMenu(params.lineUserId, richMenuId);
    } catch (err) {
      logger.error("Stripe webhook rich menu switch failed", {
        lineUserId: params.lineUserId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
}
