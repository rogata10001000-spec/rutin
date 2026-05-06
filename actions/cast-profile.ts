"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

const publicProfileSchema = z.object({
  publicProfile: z
    .string()
    .max(1000, "プロフィール文は1000文字以内で入力してください")
    .nullable(),
});

export type GetMyCastProfileResult = Result<{
  publicProfile: string | null;
}>;

export async function getMyCastProfile(): Promise<GetMyCastProfileResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  if (staff.role !== "cast") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "伴走メイトのみ編集できます" },
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("public_profile")
    .eq("id", staff.id)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "プロフィールが見つかりません" },
    };
  }

  return {
    ok: true,
    data: { publicProfile: data.public_profile ?? null },
  };
}

export type UpdateMyCastProfileResult = Result<{
  publicProfile: string | null;
}>;

export async function updateMyCastProfile(
  input: z.infer<typeof publicProfileSchema>
): Promise<UpdateMyCastProfileResult> {
  const parsed = publicProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  if (staff.role !== "cast") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "伴走メイトのみ編集できます" },
    };
  }

  const publicProfile = parsed.data.publicProfile?.trim() || null;
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("staff_profiles")
    .update({ public_profile: publicProfile })
    .eq("id", staff.id)
    .eq("role", "cast");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "プロフィール文の保存に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "STAFF_PROFILE_UPDATE",
    targetType: "staff_profiles",
    targetId: staff.id,
    success: true,
    metadata: buildAuditMetadata({ public_profile_updated: true }),
    actorStaffId: staff.id,
  });

  revalidatePath("/my-photos");
  revalidatePath("/subscribe/cast");

  return { ok: true, data: { publicProfile } };
}
