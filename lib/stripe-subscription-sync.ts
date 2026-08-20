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

/**
 * 契約成立時の副作用（担当割当・リッチメニュー・案内push・担当への通知）。
 *
 * checkout.session.completed と customer.subscription.created の**両方**から呼ばれる。
 * 2つのイベントはどちらが先に届くか・片方しか届かないかが保証されないため、
 * 両方から呼ぶ設計自体は正しい（片方だけに寄せると取りこぼす）。
 *
 * その代わり、この関数の中身は「1契約につき1回」を自分で保証する必要がある:
 *   - 冪等な操作（trial_end_at・担当割当・リッチメニュー切替）は素通し
 *     （2回走っても同じ結果。途中クラッシュ時にもう片方のイベントで再試行される）
 *   - **送信系（友だち追加の案内push・担当メイトへのWeb Push）は claim-first で1回だけ**。
 *     イベント単位の冪等化では防げない（イベントIDが違うため）。
 *     実害: 契約直後に「ご契約ありがとうございます」が2通届いた（2026-08-18 実機で発生）。
 */
export async function syncNewSubscriptionSideEffects(
  supabase: SupabaseAdmin,
  params: {
    endUserId: string;
    lineUserId: string;
    castId: string;
    /** 送信系の1回制御キー（この契約について案内を送ったか） */
    stripeSubscriptionId: string;
    /** 運営向け新規会員通知に使う（claimゲートの中で1回だけ送る） */
    planCode: string;
    status: string;
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

  // ここから先は送信系。webhook_events の (provider, event_id) UNIQUE を業務キーで
  // 再利用し、「この契約の案内送信」を1回に制限する（claim-first）。
  // 顧客向け通知は 二重送信の害 > 送信漏れの害 なので、claim後のクラッシュは
  // 送信漏れ側に倒す（案内は契約完了画面にも出ており、届かなくても復旧手段がある）。
  const now = new Date().toISOString();
  const { error: claimError } = await supabase.from("webhook_events").insert({
    provider: "stripe",
    event_id: `activation-notify:${params.stripeSubscriptionId}`,
    event_type: "subscription_activation_notify",
    status: "processed",
    processing_started_at: now,
    processed_at: now,
    success: true,
  });

  if (claimError) {
    if (claimError.code !== "23505") {
      // DB障害などの不明エラー: 送ると二重の危険があるため送らない側に倒す
      logger.warn("activation notify claim failed, skipping sends", {
        stripeSubscriptionId: params.stripeSubscriptionId,
        error: claimError.message,
      });
    }
    // 23505 = もう片方のイベントが送信済み。正常系
    return;
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

  // 担当メイトへ新規契約を即時通知（Web Push・best-effort）。
  // アクティベーション＝定着のため、担当が最初のひと言を素早く送れるようにする。
  try {
    const { sendPushToStaff } = await import("@/lib/push-notifications");
    const { data: eu } = await supabase
      .from("end_users")
      .select("nickname, line_display_name")
      .eq("id", params.endUserId)
      .maybeSingle();
    const userName = eu?.line_display_name || eu?.nickname || "新規ユーザー";
    await sendPushToStaff(params.castId, {
      title: "新しい担当ユーザーが契約しました",
      body: `${userName} さんへ、最初のメッセージを送りましょう。`,
      url: `/inbox?user=${params.endUserId}`,
      tag: `new-contract-${params.endUserId}`,
    });
  } catch (err) {
    logger.error("Stripe webhook new-contract push failed", {
      castId: params.castId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  // 運営向けの新規会員通知も同じclaimの中で送る。
  // 以前は checkout.session.completed 側の「INSERTに勝ったときだけ」送っていたため、
  // customer.subscription.created が先に届いてINSERTに勝つと（そちらには通知呼び出しが無く）
  // 通知が1回も飛ばなかった。イベントの到着順に依存させず、ここで確実に1回送る。
  try {
    const { notifyOperatorsOfNewMember } = await import("@/lib/operator-notifications");
    await notifyOperatorsOfNewMember(supabase, {
      endUserId: params.endUserId,
      planCode: params.planCode,
      status: params.status,
    });
  } catch (err) {
    logger.error("Stripe webhook operator notify failed", {
      endUserId: params.endUserId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
