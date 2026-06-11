"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessUser } from "@/lib/auth";
import type { Result } from "./types";

export type MarkThreadReadInput = {
  endUserId: string;
};

export type MarkThreadReadResult = Result<{ updated: boolean }>;

/**
 * スタッフごとのスレッド既読位置を更新
 */
export async function markThreadRead(
  input: MarkThreadReadInput
): Promise<MarkThreadReadResult> {
  if (!input.endUserId) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "ユーザーIDが必要です" },
    };
  }

  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("staff_thread_reads")
    .select("id, last_read_at")
    .eq("staff_id", access.id)
    .eq("end_user_id", input.endUserId)
    .maybeSingle();

  if (selectError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "既読状態の取得に失敗しました" },
    };
  }

  if (!existing) {
    const { error: insertError } = await supabase.from("staff_thread_reads").insert({
      staff_id: access.id,
      end_user_id: input.endUserId,
      last_read_at: nowIso,
    });

    if (insertError) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "既読状態の保存に失敗しました" },
      };
    }
  } else {
    const prev = new Date(existing.last_read_at).getTime();
    const next = new Date(nowIso).getTime();

    if (next > prev) {
      const { error: updateError } = await supabase
        .from("staff_thread_reads")
        .update({ last_read_at: nowIso })
        .eq("id", existing.id);

      if (updateError) {
        return {
          ok: false,
          error: { code: "UNKNOWN", message: "既読状態の更新に失敗しました" },
        };
      }
    }
  }

  revalidatePath("/inbox");
  return { ok: true, data: { updated: true } };
}
