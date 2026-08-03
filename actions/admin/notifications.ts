"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { pushToOperatorRecipients } from "@/lib/operator-notifications";
import { buildIlikeOrFilter } from "@/lib/postgrest-filter";
import { Result } from "../types";

function resolveName(nickname: string | null, lineDisplayName: string | null): string {
  if (nickname && !nickname.startsWith("ユーザー_")) return nickname;
  return lineDisplayName ?? nickname ?? "名称未設定";
}

export type NotifyRecipient = {
  endUserId: string;
  displayName: string;
  hasLine: boolean;
};

export type GetNotifyRecipientsResult = Result<{ recipients: NotifyRecipient[] }>;

/** 新規会員通知の宛先一覧（Admin）。 */
export async function getNewMemberNotifyRecipients(): Promise<GetNotifyRecipientsResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("operator_notification_recipients")
    .select("end_user_id, end_users ( nickname, line_display_name, line_user_id )")
    .eq("event_type", "new_member")
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "取得に失敗しました" } };
  }

  const recipients: NotifyRecipient[] = (data ?? []).map((row) => {
    const u = row.end_users as unknown as {
      nickname: string;
      line_display_name: string | null;
      line_user_id: string | null;
    } | null;
    return {
      endUserId: row.end_user_id,
      displayName: resolveName(u?.nickname ?? null, u?.line_display_name ?? null),
      hasLine: !!u?.line_user_id,
    };
  });

  return { ok: true, data: { recipients } };
}

export type NotifyCandidate = {
  endUserId: string;
  displayName: string;
  status: string;
};

export type SearchNotifyCandidatesResult = Result<{ candidates: NotifyCandidate[] }>;

/** 通知先の候補（LINE連携済み end_users）を名前で検索（Admin）。 */
export async function searchNotifyCandidates(
  query: string
): Promise<SearchNotifyCandidatesResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  let q = supabase
    .from("end_users")
    .select("id, nickname, line_display_name, status")
    .not("line_user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  // フィルタ構文インジェクションを防ぐため共通ヘルパーで組み立てる。
  const orFilter = buildIlikeOrFilter(["nickname", "line_display_name"], query);
  if (orFilter) {
    q = q.or(orFilter);
  }

  const { data, error } = await q;
  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "検索に失敗しました" } };
  }

  const candidates: NotifyCandidate[] = (data ?? []).map((u) => ({
    endUserId: u.id,
    displayName: resolveName(u.nickname, u.line_display_name),
    status: u.status,
  }));

  return { ok: true, data: { candidates } };
}

const endUserIdSchema = z.object({ endUserId: z.string().uuid() });

export type MutateRecipientResult = Result<{ endUserId: string }>;

/** 通知先を追加（Admin）。 */
export async function addNewMemberNotifyRecipient(input: {
  endUserId: string;
}): Promise<MutateRecipientResult> {
  const parsed = endUserIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("operator_notification_recipients")
    .upsert(
      {
        event_type: "new_member",
        end_user_id: parsed.data.endUserId,
        created_by: admin.id,
      },
      { onConflict: "event_type,end_user_id", ignoreDuplicates: true }
    );

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "追加に失敗しました" } };
  }

  await writeAuditLog({
    action: "PLAN_SETTINGS_UPDATE",
    targetType: "operator_notification_recipients",
    targetId: parsed.data.endUserId,
    success: true,
    metadata: { kind: "add_new_member_recipient" },
  });

  revalidatePath("/admin/notifications");
  return { ok: true, data: { endUserId: parsed.data.endUserId } };
}

/** 通知先を削除（Admin）。 */
export async function removeNewMemberNotifyRecipient(input: {
  endUserId: string;
}): Promise<MutateRecipientResult> {
  const parsed = endUserIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("operator_notification_recipients")
    .delete()
    .eq("event_type", "new_member")
    .eq("end_user_id", parsed.data.endUserId);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "削除に失敗しました" } };
  }

  revalidatePath("/admin/notifications");
  return { ok: true, data: { endUserId: parsed.data.endUserId } };
}

export type SendTestResult = Result<{ sent: number }>;

/** 現在の通知先へテスト通知を送る（Admin）。 */
export async function sendTestNewMemberNotification(): Promise<SendTestResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  const nowJst = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const message =
    `🔔 これはテスト通知です\n\n` +
    `新規会員が登録されると、この形式でお知らせが届きます。\n` +
    `送信時刻: ${nowJst}`;

  const sent = await pushToOperatorRecipients(supabase, "new_member", message);

  if (sent === 0) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "送信できませんでした。通知先が未設定か、LINEに届かない可能性があります",
      },
    };
  }

  return { ok: true, data: { sent } };
}
