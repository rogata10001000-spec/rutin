"use server";

import { revalidatePath } from "next/cache";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { upsertStepMessageSchema, type UpsertStepMessageInput } from "@/schemas/step-messages";

export type StepMessage = {
  id: string;
  stepOrder: number;
  delayHours: number;
  title: string | null;
  body: string;
  active: boolean;
};

export type GetStepMessagesResult = Result<{ items: StepMessage[] }>;

/** ステップ配信メッセージ一覧 */
export async function getStepMessages(): Promise<GetStepMessagesResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("step_messages")
    .select("id, step_order, delay_hours, title, body, active")
    .order("step_order", { ascending: true })
    .order("delay_hours", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "データの取得に失敗しました" } };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((r) => ({
        id: r.id,
        stepOrder: r.step_order,
        delayHours: r.delay_hours,
        title: r.title,
        body: r.body,
        active: r.active,
      })),
    },
  };
}

export type UpsertStepMessageResult = Result<{ id: string }>;

/** ステップ配信メッセージ作成/更新 */
export async function upsertStepMessage(
  input: UpsertStepMessageInput
): Promise<UpsertStepMessageResult> {
  const parsed = upsertStepMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = await createServerSupabaseClient();
  const payload = {
    step_order: parsed.data.stepOrder,
    delay_hours: parsed.data.delayHours,
    title: parsed.data.title?.trim() || null,
    body: parsed.data.body,
    active: parsed.data.active,
    updated_at: new Date().toISOString(),
  };

  let id = parsed.data.id;
  if (id) {
    const { error } = await supabase.from("step_messages").update(payload).eq("id", id);
    if (error) {
      return { ok: false, error: { code: "UNKNOWN", message: "保存に失敗しました" } };
    }
  } else {
    const { data, error } = await supabase
      .from("step_messages")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: { code: "UNKNOWN", message: "保存に失敗しました" } };
    }
    id = data.id;
  }

  await writeAuditLog({
    action: "UPSERT_STEP_MESSAGE",
    targetType: "step_messages",
    targetId: id,
    success: true,
    metadata: buildAuditMetadata(parsed.data),
  });

  revalidatePath("/admin/step-messages");
  return { ok: true, data: { id } };
}

export type DeleteStepMessageResult = Result<void>;

/** ステップ配信メッセージ削除 */
export async function deleteStepMessage(id: string): Promise<DeleteStepMessageResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("step_messages").delete().eq("id", id);
  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "削除に失敗しました" } };
  }

  await writeAuditLog({
    action: "DELETE_STEP_MESSAGE",
    targetType: "step_messages",
    targetId: id,
    success: true,
  });

  revalidatePath("/admin/step-messages");
  return { ok: true, data: undefined };
}
