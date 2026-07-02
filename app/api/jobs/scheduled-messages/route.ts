import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getSendAccountForEndUser } from "@/lib/line-accounts";
import { pushTextMessage } from "@/lib/line";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 100;

/**
 * 予約送信ジョブ（10分間隔想定・Vercel Cron から GET）。
 * 期日到来の scheduled_messages を LINE 送信し、messages(out) に記録する。
 * - 楽観ロック（pending→sending の条件付きUPDATE）で多重実行に耐える
 * - 送信時点で契約中でない/ブロック済みユーザーはスキップ（failedとして理由を記録）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_messages")
    .select("id, end_user_id, created_by, body")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    logger.error("scheduled-messages: fetch due failed", { error: error.message });
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    // 楽観ロック: 他の実行が先に取っていたらスキップ
    const { data: claimed } = await supabase
      .from("scheduled_messages")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");

    if (!claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    const fail = async (message: string) => {
      failed += 1;
      await supabase
        .from("scheduled_messages")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    };

    try {
      const { data: user } = await supabase
        .from("end_users")
        .select("id, line_user_id, status, is_blocked")
        .eq("id", row.end_user_id)
        .maybeSingle();

      if (!user) {
        await fail("ユーザーが見つかりません");
        continue;
      }
      if (user.is_blocked) {
        await fail("ユーザーがブロックされています");
        continue;
      }
      if (["incomplete", "canceled"].includes(user.status)) {
        await fail("ユーザーが契約中ではないため送信を中止しました");
        continue;
      }

      const account = await getSendAccountForEndUser(user.id, supabase);
      await pushTextMessage(account.credentials, user.line_user_id, row.body);

      const { data: message, error: msgError } = await supabase
        .from("messages")
        .insert({
          end_user_id: user.id,
          direction: "out",
          body: row.body,
          sent_by_staff_id: row.created_by,
          sent_as_proxy: false,
          line_account_id: account.id,
        })
        .select("id")
        .single();

      if (msgError) {
        // LINEには届いているためfailedにはせず、記録エラーとして残す
        logger.error("scheduled-messages: message insert failed", {
          scheduledId: row.id,
          error: msgError.message,
        });
      }

      await supabase
        .from("scheduled_messages")
        .update({
          status: "sent",
          sent_message_id: message?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      sent += 1;
    } catch (err) {
      await fail(err instanceof Error ? err.message : "送信に失敗しました");
    }
  }

  if (sent > 0 || failed > 0) {
    logger.info("scheduled-messages job finished", { sent, failed, skipped });
  }

  return NextResponse.json({ ok: true, sent, failed, skipped });
}
