"use server";

import { revalidatePath } from "next/cache";
import { sendMessageSchema, sendProxyMessageSchema } from "@/schemas/messages";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canSendMessage, requireAdminOrSupervisor } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { pushTextMessage } from "@/lib/line";

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

  revalidatePath("/inbox");
  revalidatePath(`/chat/${user.id}`);

  return { ok: true, data: { messageId: message.id } };
}
