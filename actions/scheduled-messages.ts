"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { Result, toZodErrorMessage } from "./types";

const MAX_SCHEDULE_ITEMS = 500;
const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7日先まで

const scheduleBulkSchema = z.object({
  scheduledAt: z.string().datetime(),
  messages: z
    .array(
      z.object({
        endUserId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
      })
    )
    .min(1, "送信対象がありません")
    .max(MAX_SCHEDULE_ITEMS, `一度に予約できるのは${MAX_SCHEDULE_ITEMS}件までです`),
});

export type ScheduleBulkMessagesInput = z.infer<typeof scheduleBulkSchema>;
export type ScheduleBulkMessagesResult = Result<{ count: number }>;

/**
 * 複数ユーザーへの予約送信を登録する。
 * 実際の送信は cron（/api/jobs/scheduled-messages）が期日到来分を処理する。
 * 権限: RLS（本人名義＋担当 or Admin/SV）で行単位に強制される。
 */
export async function scheduleBulkMessages(
  input: ScheduleBulkMessagesInput
): Promise<ScheduleBulkMessagesResult> {
  const parsed = scheduleBulkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  const now = Date.now();
  if (scheduledAt.getTime() <= now + 60_000) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "予約時刻は現在より後の時刻を指定してください" },
    };
  }
  if (scheduledAt.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "予約できるのは7日先までです" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // RLSクライアントで一括insert。担当外ユーザーが1件でも混ざるとポリシー違反で全体が失敗する
  // （部分登録による「一部だけ予約された」混乱を避ける意図もあり、全件成功/全件失敗とする）。
  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert(
      parsed.data.messages.map((m) => ({
        end_user_id: m.endUserId,
        created_by: staff.id,
        body: m.body,
        scheduled_at: scheduledAt.toISOString(),
      }))
    )
    .select("id");

  if (error) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "予約に失敗しました。担当外のユーザーが含まれていないか確認してください",
      },
    };
  }

  await writeAuditLog({
    action: "SEND_MESSAGE",
    targetType: "scheduled_messages",
    targetId: data?.[0]?.id ?? staff.id,
    success: true,
    metadata: buildAuditMetadata({
      kind: "schedule_bulk",
      count: data?.length ?? 0,
      scheduled_at: scheduledAt.toISOString(),
    }),
  });

  return { ok: true, data: { count: data?.length ?? 0 } };
}

export type ScheduledMessageItem = {
  id: string;
  endUserId: string;
  displayName: string;
  body: string;
  scheduledAt: string;
};

export type ListScheduledResult = Result<{ items: ScheduledMessageItem[] }>;

/** 自分が予約中（pending）の送信一覧。 */
export async function listMyScheduledMessages(): Promise<ListScheduledResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("id, end_user_id, body, scheduled_at, end_users ( nickname, line_display_name )")
    .eq("created_by", staff.id)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "予約の取得に失敗しました" } };
  }

  const items: ScheduledMessageItem[] = (data ?? []).map((row) => {
    const user = row.end_users as unknown as {
      nickname: string;
      line_display_name: string | null;
    } | null;
    const nickname = user?.nickname ?? "不明";
    const displayName =
      nickname.startsWith("ユーザー_") && user?.line_display_name
        ? user.line_display_name
        : nickname;
    return {
      id: row.id,
      endUserId: row.end_user_id,
      displayName,
      body: row.body,
      scheduledAt: row.scheduled_at,
    };
  });

  return { ok: true, data: { items } };
}

export type CancelScheduledResult = Result<{ id: string }>;

/** 予約をキャンセルする（pending のみ・自分の予約のみ）。 */
export async function cancelScheduledMessage(input: {
  id: string;
}): Promise<CancelScheduledResult> {
  const idParsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!idParsed.success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("scheduled_messages")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", idParsed.data.id)
    .eq("status", "pending")
    .select("id");

  if (error || !data || data.length === 0) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "この予約は取り消せません（送信済みの可能性があります）" },
    };
  }

  return { ok: true, data: { id: idParsed.data.id } };
}
