"use server";

import { revalidatePath } from "next/cache";
import { sendMessageSchema, sendProxyMessageSchema } from "@/schemas/messages";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canSendMessage, requireAdminOrSupervisor } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { pushTextMessage } from "@/lib/line";

const planSlaConfig: Record<string, number> = {
  light: 1440,
  standard: 720,
  premium: 120,
};

async function recordResponseMetric(
  endUserId: string,
  staffId: string,
  replyMessageId: string
) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: user } = await supabase
      .from("end_users")
      .select("plan_code")
      .eq("id", endUserId)
      .single();

    const planCode = user?.plan_code ?? "standard";
    const slaMinutes = planSlaConfig[planCode] ?? 720;

    const { data: lastInMsg } = await supabase
      .from("messages")
      .select("id, created_at")
      .eq("end_user_id", endUserId)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastInMsg) return;

    const { data: prevOut } = await supabase
      .from("messages")
      .select("created_at")
      .eq("end_user_id", endUserId)
      .eq("direction", "out")
      .neq("id", replyMessageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastInTime = new Date(lastInMsg.created_at);
    const prevOutTime = prevOut ? new Date(prevOut.created_at) : null;

    if (prevOutTime && prevOutTime > lastInTime) return;

    const now = new Date();
    const responseMinutes = Math.floor(
      (now.getTime() - lastInTime.getTime()) / (1000 * 60)
    );

    await supabase.from("response_metrics").insert({
      end_user_id: endUserId,
      staff_id: staffId,
      user_message_id: lastInMsg.id,
      reply_message_id: replyMessageId,
      response_minutes: responseMinutes,
      plan_code: planCode,
      sla_minutes: slaMinutes,
      sla_breached: responseMinutes > slaMinutes,
    });
  } catch {
    // メトリクス記録の失敗はメッセージ送信を妨げない
  }
}

export type SendMessageInput = {
  endUserId: string;
  body: string;
};

export type SendMessageResult = Result<{ messageId: string }>;

/**
 * メッセージ送信
 * 権限: Admin/Supervisor/Cast（担当）
 * Shadow: 送信不可（canSendMessageで拒否）
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  // Zodバリデーション
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // 権限チェック（担当 or Admin/Supervisor, Shadowは拒否）
  const auth = await canSendMessage(parsed.data.endUserId);
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへの送信権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // end_user取得（line_user_id）
  const { data: user } = await supabase
    .from("end_users")
    .select("id, line_user_id, status")
    .eq("id", parsed.data.endUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // LINE送信
  try {
    await pushTextMessage(user.line_user_id, parsed.data.body);
  } catch (err) {
    // LINE送信失敗は監査ログに記録して返す
    await writeAuditLog({
      action: "SEND_MESSAGE",
      targetType: "end_users",
      targetId: user.id,
      success: false,
      metadata: buildAuditMetadata({
        body: parsed.data.body.slice(0, 100),
        error: err instanceof Error ? err.message : "Unknown error",
      }),
    });

    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "LINE送信に失敗しました" },
    };
  }

  // messages(out) insert
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({
      end_user_id: user.id,
      direction: "out",
      body: parsed.data.body,
      sent_by_staff_id: auth.id,
      sent_as_proxy: false,
    })
    .select("id")
    .single();

  if (msgError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メッセージの保存に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "SEND_MESSAGE",
    targetType: "messages",
    targetId: message.id,
    success: true,
    metadata: buildAuditMetadata({
      end_user_id: user.id,
      body_length: parsed.data.body.length,
    }),
  });

  // レスポンスメトリクス記録（非同期、失敗しても送信は成功）
  recordResponseMetric(user.id, auth.id, message.id);

  revalidatePath("/inbox");
  revalidatePath(`/chat/${user.id}`);

  return { ok: true, data: { messageId: message.id } };
}

export type SendProxyMessageInput = {
  endUserId: string;
  body: string;
  reason?: string;
};

export type SendProxyMessageResult = Result<{ messageId: string }>;

/**
 * 代理返信
 * 権限: Admin/Supervisor のみ
 */
export async function sendProxyMessage(
  input: SendProxyMessageInput
): Promise<SendProxyMessageResult> {
  // Zodバリデーション
  const parsed = sendProxyMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // 権限チェック（Admin/Supervisorのみ）
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "代理返信の権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // end_user取得
  const { data: user } = await supabase
    .from("end_users")
    .select("id, line_user_id, assigned_cast_id")
    .eq("id", parsed.data.endUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // LINE送信
  try {
    await pushTextMessage(user.line_user_id, parsed.data.body);
  } catch (err) {
    await writeAuditLog({
      action: "PROXY_SEND",
      targetType: "end_users",
      targetId: user.id,
      success: false,
      metadata: buildAuditMetadata(
        { body: parsed.data.body.slice(0, 100) },
        {
          reason: parsed.data.reason,
          externalApiResult: { error: err instanceof Error ? err.message : "Unknown" },
        }
      ),
    });

    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "LINE送信に失敗しました" },
    };
  }

  // messages(out) insert（sent_as_proxy=true）
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({
      end_user_id: user.id,
      direction: "out",
      body: parsed.data.body,
      sent_by_staff_id: auth.id,
      sent_as_proxy: true,
      proxy_for_cast_id: user.assigned_cast_id,
    })
    .select("id")
    .single();

  if (msgError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メッセージの保存に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "PROXY_SEND",
    targetType: "messages",
    targetId: message.id,
    success: true,
    metadata: buildAuditMetadata(
      {
        end_user_id: user.id,
        body_length: parsed.data.body.length,
        proxy_for_cast_id: user.assigned_cast_id,
      },
      { reason: parsed.data.reason }
    ),
  });

  // レスポンスメトリクス記録
  recordResponseMetric(user.id, auth.id, message.id);

  revalidatePath("/inbox");
  revalidatePath(`/chat/${user.id}`);

  return { ok: true, data: { messageId: message.id } };
}
