import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getSendAccountForEndUser } from "@/lib/line-accounts";
import { pushTextMessage } from "@/lib/line";
import { logger } from "@/lib/logger";
import { resolvePlanLabels } from "@/lib/funnel-copy";
import { planLabel } from "@/lib/plan-labels";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

/** 自動生成ニックネーム(ユーザー_xxx)ならLINE表示名を優先して、自然な名前を返す。 */
function resolveMemberName(nickname: string | null, lineDisplayName: string | null): string {
  if (nickname && !nickname.startsWith("ユーザー_")) return nickname;
  return lineDisplayName ?? nickname ?? "名称未設定";
}

/**
 * 指定 event_type の通知先(end_users)へ、任意の本文を LINE 送信する。
 * 各受信者が実際に友だち追加しているアカウント(getSendAccountForEndUser)から push するため、
 * 公式LINE・メイトLINEどちらの登録でも届く。失敗は握りつぶしログのみ（呼び出し元を壊さない）。
 * 送信できた件数を返す。
 */
export async function pushToOperatorRecipients(
  supabase: SupabaseAdmin,
  eventType: "new_member",
  message: string
): Promise<number> {
  const { data: recipients, error } = await supabase
    .from("operator_notification_recipients")
    .select("end_user_id")
    .eq("event_type", eventType);

  if (error || !recipients || recipients.length === 0) return 0;

  let sent = 0;
  for (const r of recipients) {
    try {
      const { data: recipient } = await supabase
        .from("end_users")
        .select("line_user_id")
        .eq("id", r.end_user_id)
        .maybeSingle();
      if (!recipient?.line_user_id) continue;

      const account = await getSendAccountForEndUser(r.end_user_id, supabase);
      await pushTextMessage(account.credentials, recipient.line_user_id, message);
      sent += 1;
    } catch (err) {
      logger.warn("operator notify push failed", {
        eventType,
        recipientEndUserId: r.end_user_id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return sent;
}

/**
 * 新規会員登録を運営の通知先へLINE通知する。
 * Stripe webhook（契約作成＝会員登録の瞬間）から after() で呼ぶ想定。
 */
export async function notifyOperatorsOfNewMember(
  supabase: SupabaseAdmin,
  params: { endUserId: string; planCode: string; status: string }
): Promise<void> {
  try {
    // 送信の有無に関わらず、まず通知先が居るかを見て、居なければ会員情報の取得もしない
    const { data: recipients } = await supabase
      .from("operator_notification_recipients")
      .select("end_user_id")
      .eq("event_type", "new_member")
      .limit(1);
    if (!recipients || recipients.length === 0) return;

    const { data: member } = await supabase
      .from("end_users")
      .select("nickname, line_display_name, person_id, assigned_cast_id")
      .eq("id", params.endUserId)
      .maybeSingle();

    // 同じ人が何人目のメイトを契約したかを数える（新規獲得と追加契約を区別して見るため）。
    // 追加契約はLTVの伸びを示す指標なので、通知の時点で分かるようにする。
    let mateCount = 1;
    if (member?.person_id) {
      const { data: liveRows } = await supabase
        .from("subscriptions")
        .select("end_users!inner(person_id, assigned_cast_id)")
        .eq("end_users.person_id", member.person_id)
        .in("status", ["trial", "active", "past_due", "paused"]);
      const castIds = new Set(
        (liveRows ?? [])
          .map(
            (r) =>
              (r as unknown as { end_users: { assigned_cast_id: string | null } }).end_users
                ?.assigned_cast_id
          )
          .filter((v): v is string => Boolean(v))
      );
      // このイベントのメイトがまだ集計に入っていない場合（同期タイミング差）を吸収
      if (member.assigned_cast_id) castIds.add(member.assigned_cast_id);
      mateCount = Math.max(1, castIds.size);
    }

    const name = resolveMemberName(member?.nickname ?? null, member?.line_display_name ?? null);
    // プラン名は /admin/preview で改名できるため、通知文でも設定値を正とする
    const plan = planLabel(params.planCode, await resolvePlanLabels());
    const kind = params.status === "trial" ? "無料トライアル開始" : "契約開始";
    const nowJst = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isAdditional = mateCount > 1;
    const message =
      (isAdditional
        ? `🎉 追加でメイトを契約されました（${mateCount}人目）\n\n`
        : `🎉 新しい会員が登録されました\n\n`) +
      `お名前: ${name}さん\n` +
      `プラン: ${plan}\n` +
      `区分: ${kind}\n` +
      `日時: ${nowJst}`;

    await pushToOperatorRecipients(supabase, "new_member", message);
  } catch (err) {
    logger.warn("notifyOperatorsOfNewMember failed", {
      endUserId: params.endUserId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
