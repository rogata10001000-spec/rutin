"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { generateStyleSummary } from "@/lib/ai-style";
import { Result } from "./types";

// =============================================================
// メイトの返信スタイル（AI下書きの口調の元）の取得・編集・自動生成。
// 権限: 本人（cast）／admin・supervisor は任意のメイトに対して操作可。
// =============================================================

export type CastStyleView = {
  castId: string;
  displayName: string;
  styleSummary: string | null;
  styleUpdatedAt: string | null;
  /** 学習に使える送信履歴の件数（自動生成の可否をUIで示すため） */
  sampleCount: number;
};

const styleSchema = z.object({
  castId: z.string().uuid(),
  styleSummary: z.string().trim().max(600, "スタイルは600文字以内で入力してください"),
});

/** 対象メイトを操作できるか（本人 or admin/supervisor） */
async function resolveStyleAccess(
  castId: string
): Promise<
  { ok: true; staffId: string; message?: undefined } | { ok: false; message: string; staffId?: undefined }
> {
  const staff = await getCurrentStaff();
  if (!staff) return { ok: false, message: "ログインが必要です" };
  const isManager = staff.role === "admin" || staff.role === "supervisor";
  if (!isManager && staff.id !== castId) {
    return { ok: false, message: "このメイトのスタイルを編集する権限がありません" };
  }
  return { ok: true, staffId: staff.id };
}

export async function getCastStyle(castId: string): Promise<Result<CastStyleView>> {
  const access = await resolveStyleAccess(castId);
  if (!access.ok) {
    return { ok: false, error: { code: "FORBIDDEN", message: access.message } };
  }

  const supabase = createAdminSupabaseClient();
  const [{ data: cast }, { count }] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("id, display_name, style_summary, style_updated_at")
      .eq("id", castId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("sent_by_staff_id", castId)
      .eq("direction", "out")
      .eq("message_type", "text")
      .eq("sent_as_proxy", false),
  ]);

  if (!cast) {
    return { ok: false, error: { code: "NOT_FOUND", message: "メイトが見つかりません" } };
  }

  return {
    ok: true,
    data: {
      castId: cast.id,
      displayName: cast.display_name,
      styleSummary: cast.style_summary,
      styleUpdatedAt: cast.style_updated_at,
      sampleCount: count ?? 0,
    },
  };
}

/** スタイルを保存する（空文字なら未設定に戻す） */
export async function updateCastStyle(input: {
  castId: string;
  styleSummary: string;
}): Promise<Result<{ styleUpdatedAt: string }>> {
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "ZOD_ERROR",
        message: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
      },
    };
  }

  const access = await resolveStyleAccess(parsed.data.castId);
  if (!access.ok) {
    return { ok: false, error: { code: "FORBIDDEN", message: access.message } };
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  // 空文字は「未設定」に戻す（null）。空文字のまま保存するとプロンプトに空欄が入る
  const value = parsed.data.styleSummary.trim() || null;

  const { error } = await supabase
    .from("staff_profiles")
    .update({ style_summary: value, style_updated_at: value ? now : null })
    .eq("id", parsed.data.castId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "保存できませんでした。もう一度お試しください" },
    };
  }

  await writeAuditLog({
    action: "UPDATE_CAST_STYLE",
    targetType: "staff_profiles",
    targetId: parsed.data.castId,
    success: true,
    metadata: buildAuditMetadata({ length: value?.length ?? 0, cleared: !value }),
    actorStaffId: access.staffId,
  });

  revalidatePath("/my-style");
  return { ok: true, data: { styleUpdatedAt: now } };
}

/**
 * 送信履歴からスタイル案を生成する（保存はしない）。
 * 生成結果を編集画面に差し込み、メイト本人が確認・修正してから保存する。
 */
export async function suggestCastStyle(
  castId: string
): Promise<Result<{ summary: string; sampleCount: number }>> {
  const access = await resolveStyleAccess(castId);
  if (!access.ok) {
    return { ok: false, error: { code: "FORBIDDEN", message: access.message } };
  }

  const supabase = createAdminSupabaseClient();
  const result = await generateStyleSummary(supabase, castId);

  if (!result.ok) {
    return { ok: false, error: { code: "EXTERNAL_API_ERROR", message: result.error } };
  }

  return { ok: true, data: { summary: result.summary, sampleCount: result.sampleCount } };
}
