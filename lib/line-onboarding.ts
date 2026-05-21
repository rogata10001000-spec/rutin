import { pushTextMessage, switchRichMenu } from "@/lib/line";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { createAdminSupabaseClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export function endUserNicknameFromLineId(lineUserId: string): string {
  return `ユーザー_${lineUserId.slice(-6)}`;
}

/** 未契約ユーザー向け welcome + リッチメニュー（follow / 初回 message 共通） */
export async function sendLineUncontractedOnboarding(
  lineUserId: string,
  welcomeMessage: string
): Promise<void> {
  await pushTextMessage(lineUserId, welcomeMessage);

  const richMenuId = getServerEnv().RICH_MENU_ID_UNCONTRACTED;
  if (richMenuId) {
    try {
      await switchRichMenu(lineUserId, richMenuId);
    } catch (err) {
      logger.error("LINE uncontracted rich menu switch failed", {
        lineUserId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
}

/**
 * incomplete ユーザーを取得または作成（line_user_id ユニーク競合を吸収）
 */
export async function ensureIncompleteEndUser(
  supabase: SupabaseAdmin,
  lineUserId: string,
  planCode: string
): Promise<{ id: string; isNew: boolean }> {
  const { data: existing } = await supabase
    .from("end_users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  const { data: created, error } = await supabase
    .from("end_users")
    .insert({
      line_user_id: lineUserId,
      nickname: endUserNicknameFromLineId(lineUserId),
      status: "incomplete",
      plan_code: planCode,
    })
    .select("id")
    .single();

  if (!error && created) {
    return { id: created.id, isNew: true };
  }

  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("end_users")
      .select("id")
      .eq("line_user_id", lineUserId)
      .single();
    if (raced) return { id: raced.id, isNew: false };
  }

  throw new Error(`Failed to ensure end_user: ${error?.message ?? "unknown"}`);
}
