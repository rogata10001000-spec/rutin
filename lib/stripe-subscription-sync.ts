import type Stripe from "stripe";
import type { createAdminSupabaseClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export function endUserNicknameFromLineId(lineUserId: string): string {
  return `ユーザー_${lineUserId.slice(-6)}`;
}

export function trialEndAtFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  if (subscription.trial_end) {
    return new Date(subscription.trial_end * 1000).toISOString();
  }
  return null;
}

export function currentPeriodEndFromStripeSubscription(
  subscription: Stripe.Subscription
): string | null {
  const subscriptionWithItemPeriods = subscription as Stripe.Subscription & {
    items?: {
      data?: Array<{ current_period_end?: number | null }>;
    };
    current_period_end?: number | null;
  };
  const unix =
    subscriptionWithItemPeriods.items?.data?.[0]?.current_period_end ??
    subscriptionWithItemPeriods.current_period_end;

  return unix ? new Date(unix * 1000).toISOString() : null;
}

export async function fetchStripeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const { stripe } = await import("@/lib/stripe");
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

  const [{ pushTextMessage, switchRichMenu }, { getDefaultLineAccount, getLineAccountForCast }, { logger }] =
    await Promise.all([
      import("@/lib/line"),
      import("@/lib/line-accounts"),
      import("@/lib/logger"),
    ]);

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

  // 契約時点ではユーザーは共通(デフォルト)アカウントの友だち。
  // 契約済リッチメニューは共通アカウント側で切り替える。
  const defaultAccount = await getDefaultLineAccount(supabase);
  const richMenuId = defaultAccount.richMenuContractedId;
  if (richMenuId) {
    try {
      await switchRichMenu(defaultAccount.credentials, params.lineUserId, richMenuId);
    } catch (err) {
      logger.error("Stripe webhook rich menu switch failed", {
        lineUserId: params.lineUserId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 担当メイトの公式LINEがあれば、友だち追加を案内する（共通アカウントから送信）。
  try {
    const mateAccount = await getLineAccountForCast(params.castId, supabase);
    if (mateAccount?.friendAddUrl) {
      const { data: cast } = await supabase
        .from("staff_profiles")
        .select("display_name")
        .eq("id", params.castId)
        .maybeSingle();
      const castName = cast?.display_name ?? "担当メイト";
      await pushTextMessage(
        defaultAccount.credentials,
        params.lineUserId,
        `ご契約ありがとうございます。\nこれからは ${castName} の公式LINEで直接やり取りができます。\n下記から友だち追加してください。\n${mateAccount.friendAddUrl}`
      );
    }
  } catch (err) {
    logger.error("Stripe webhook mate LINE invite failed", {
      lineUserId: params.lineUserId,
      castId: params.castId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
