import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getDefaultLineAccount, getLineAccountById } from "@/lib/line-accounts";
import { pushTextMessage, pushImageMessage } from "@/lib/line";
import { logger } from "@/lib/logger";

const MAX_USERS_PER_STEP = 300;

export type StepDeliveryResult = {
  processed: number;
  sent: number;
  failed: number;
};

/**
 * ステップ配信ジョブ本体。
 * - 対象: status="incomplete"（未契約フォロワー）のみ。契約したら以降は配信しない。
 * - 起点: end_users.line_followed_at。各ステップの delay_hours 経過で対象化。
 * - 冪等: step_deliveries の (end_user_id, step_message_id) UNIQUE で二重送信を防止。
 *   送信成功時のみ記録し、失敗はログのみ（次回再試行）。
 */
export async function runLineStepDelivery(): Promise<StepDeliveryResult> {
  const supabase = createAdminSupabaseClient();
  const now = Date.now();

  const { data: steps } = await supabase
    .from("step_messages")
    .select("id, trigger, delay_hours, body, image_url")
    .eq("active", true)
    .order("step_order", { ascending: true });

  const result: StepDeliveryResult = { processed: 0, sent: 0, failed: 0 };
  if (!steps || steps.length === 0) return result;

  // 送信元アカウントは事前に既定アカウントを1回だけ解決し、個別アカウントはキャッシュ経由で解決する
  // （従来はユーザー毎に primary_line_account_id を都度クエリしていたN+1を回避）。
  const defaultAccount = await getDefaultLineAccount(supabase);

  for (const step of steps) {
    const cutoffIso = new Date(now - step.delay_hours * 3600 * 1000).toISOString();

    // トリガー種別で起点列を切り替える。
    // follow=友だち追加(line_followed_at) / checkout_abandoned=決済開始(checkout_started_at)。
    // いずれも status=incomplete（＝未契約・カゴ落ち）のみが対象。契約すれば自動で対象外。
    const anchorColumn =
      step.trigger === "checkout_abandoned" ? "checkout_started_at" : "line_followed_at";

    const { data: users } = await supabase
      .from("end_users")
      .select("id, line_user_id, primary_line_account_id")
      .eq("status", "incomplete")
      .not("line_user_id", "is", null)
      .not(anchorColumn, "is", null)
      .lte(anchorColumn, cutoffIso)
      .limit(MAX_USERS_PER_STEP);

    if (!users || users.length === 0) continue;

    const userIds = users.map((u) => u.id);
    const { data: delivered } = await supabase
      .from("step_deliveries")
      .select("end_user_id")
      .eq("step_message_id", step.id)
      .in("end_user_id", userIds);
    const deliveredSet = new Set((delivered ?? []).map((d) => d.end_user_id));

    for (const user of users) {
      if (deliveredSet.has(user.id) || !user.line_user_id) continue;
      const bodyText = step.body?.trim() ?? "";
      if (!step.image_url && !bodyText) continue; // 送信内容が無い場合はスキップ（通常は起きない）

      result.processed += 1;
      try {
        const account = user.primary_line_account_id
          ? (await getLineAccountById(user.primary_line_account_id, supabase)) ?? defaultAccount
          : defaultAccount;
        if (step.image_url) {
          await pushImageMessage(
            account.credentials,
            user.line_user_id,
            step.image_url,
            bodyText || undefined
          );
        } else {
          await pushTextMessage(account.credentials, user.line_user_id, bodyText);
        }
        await supabase
          .from("step_deliveries")
          .insert({ end_user_id: user.id, step_message_id: step.id, status: "sent" });
        result.sent += 1;
      } catch (err) {
        result.failed += 1;
        logger.warn("line step delivery failed", {
          endUserId: user.id,
          stepId: step.id,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  return result;
}
