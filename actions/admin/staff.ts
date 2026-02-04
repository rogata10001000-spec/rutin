"use server";

import { revalidatePath } from "next/cache";
import { setCastAcceptingSchema, upsertStaffProfileSchema, inviteStaffSchema } from "@/schemas/staff";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// =====================================
// スタッフ一覧取得
// =====================================

export type StaffMember = {
  id: string;
  displayName: string;
  role: "admin" | "supervisor" | "cast";
  active: boolean;
  capacityLimit: number | null;
  acceptingNewUsers: boolean;
  assignedUserCount: number;
};

export type GetStaffListResult = Result<{ items: StaffMember[] }>;

/**
 * スタッフ一覧取得
 */
export async function getStaffList(): Promise<GetStaffListResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, role, active, capacity_limit, accepting_new_users")
    .order("role")
    .order("display_name");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  // 各キャストの担当ユーザー数を取得
  const items: StaffMember[] = await Promise.all(
    (data ?? []).map(async (row) => {
      let assignedUserCount = 0;
      if (row.role === "cast") {
        const { count } = await supabase
          .from("end_users")
          .select("*", { count: "exact", head: true })
          .eq("assigned_cast_id", row.id)
          .neq("status", "incomplete");
        assignedUserCount = count ?? 0;
      }

      return {
        id: row.id,
        displayName: row.display_name,
        role: row.role as "admin" | "supervisor" | "cast",
        active: row.active,
        capacityLimit: row.capacity_limit,
        acceptingNewUsers: row.accepting_new_users,
        assignedUserCount,
      };
    })
  );

  return { ok: true, data: { items } };
}

// =====================================
// スタッフ詳細取得
// =====================================

export type StaffDetail = {
  id: string;
  displayName: string;
  role: "admin" | "supervisor" | "cast";
  active: boolean;
  capacityLimit: number | null;
  acceptingNewUsers: boolean;
  styleSummary: string | null;
};

export type GetStaffDetailResult = Result<{ staff: StaffDetail }>;

/**
 * スタッフ詳細取得
 */
export async function getStaffDetail(staffId: string): Promise<GetStaffDetailResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, role, active, capacity_limit, accepting_new_users, style_summary")
    .eq("id", staffId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "スタッフが見つかりません" },
    };
  }

  return {
    ok: true,
    data: {
      staff: {
        id: data.id,
        displayName: data.display_name,
        role: data.role as "admin" | "supervisor" | "cast",
        active: data.active,
        capacityLimit: data.capacity_limit,
        acceptingNewUsers: data.accepting_new_users,
        styleSummary: data.style_summary,
      },
    },
  };
}

// =====================================
// スタッフプロフィール更新
// =====================================

export type UpsertStaffProfileInput = {
  staffId: string;
  displayName: string;
  role: "admin" | "supervisor" | "cast";
  capacityLimit?: number | null;
  active: boolean;
  acceptingNewUsers?: boolean;
};

export type UpsertStaffProfileResult = Result<{ id: string }>;

/**
 * スタッフプロフィール更新
 */
export async function upsertStaffProfile(
  input: UpsertStaffProfileInput
): Promise<UpsertStaffProfileResult> {
  const parsed = upsertStaffProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("staff_profiles")
    .update({
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      capacity_limit: parsed.data.capacityLimit ?? null,
      active: parsed.data.active,
      accepting_new_users: parsed.data.acceptingNewUsers ?? true,
    })
    .eq("id", parsed.data.staffId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "STAFF_PROFILE_UPDATE",
    targetType: "staff_profiles",
    targetId: parsed.data.staffId,
    success: true,
    metadata: buildAuditMetadata(parsed.data),
  });

  revalidatePath("/admin/staff");

  return { ok: true, data: { id: parsed.data.staffId } };
}

// =====================================
// 新規受付トグル
// =====================================

export type SetCastAcceptingInput = {
  castId: string;
  acceptingNewUsers: boolean;
};

export type SetCastAcceptingResult = Result<{
  castId: string;
  acceptingNewUsers: boolean;
}>;

/**
 * キャストの新規受付状態を変更
 */
export async function setCastAcceptingStatus(
  input: SetCastAcceptingInput
): Promise<SetCastAcceptingResult> {
  const parsed = setCastAcceptingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("staff_profiles")
    .update({ accepting_new_users: parsed.data.acceptingNewUsers })
    .eq("id", parsed.data.castId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "CAST_ACCEPTING_TOGGLED",
    targetType: "staff_profiles",
    targetId: parsed.data.castId,
    success: true,
    metadata: buildAuditMetadata({
      accepting_new_users: parsed.data.acceptingNewUsers,
    }),
  });

  revalidatePath("/admin/staff");
  revalidatePath("/subscribe/cast");

  return {
    ok: true,
    data: {
      castId: parsed.data.castId,
      acceptingNewUsers: parsed.data.acceptingNewUsers,
    },
  };
}

// =====================================
// スタッフ招待
// =====================================

export type InviteStaffInput = {
  email: string;
  displayName: string;
  role: "admin" | "supervisor" | "cast";
  capacityLimit?: number | null;
};

export type InviteStaffResult = Result<{ id: string; email: string }>;

/**
 * 新しいスタッフを招待
 * Supabase Authで招待メールを送信し、staff_profilesにレコードを作成
 */
export async function inviteStaff(
  input: InviteStaffInput
): Promise<InviteStaffResult> {
  // Zodバリデーション
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // Admin権限チェック
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  // Admin用Supabaseクライアント（service_role）を使用
  const adminSupabase = createAdminSupabaseClient();

  // 既存ユーザーチェック
  const { data: existingUsers } = await adminSupabase
    .from("staff_profiles")
    .select("id")
    .limit(1);

  // Supabase Authで招待メール送信
  const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      redirectTo: `${process.env.APP_BASE_URL}/login`,
    }
  );

  if (authError) {
    // メールが既に使用されている場合
    if (authError.message?.includes("already been registered")) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "このメールアドレスは既に登録されています" },
      };
    }
    console.error("Auth invite error:", authError);
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "招待メールの送信に失敗しました" },
    };
  }

  if (!authData.user) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ユーザーの作成に失敗しました" },
    };
  }

  // staff_profilesにレコード作成
  const { error: profileError } = await adminSupabase
    .from("staff_profiles")
    .insert({
      id: authData.user.id,
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      capacity_limit: parsed.data.capacityLimit ?? null,
      active: true,
      accepting_new_users: parsed.data.role === "cast" ? true : false,
    });

  if (profileError) {
    console.error("Profile insert error:", profileError);
    // ユーザーは作成されたがプロフィールの作成に失敗した場合
    // ユーザーを削除してロールバック
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "スタッフプロフィールの作成に失敗しました" },
    };
  }

  // 監査ログ記録
  await writeAuditLog({
    action: "STAFF_INVITE",
    targetType: "staff_profiles",
    targetId: authData.user.id,
    success: true,
    metadata: buildAuditMetadata({
      email: parsed.data.email,
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      capacity_limit: parsed.data.capacityLimit,
    }),
  });

  revalidatePath("/admin/staff");

  return {
    ok: true,
    data: {
      id: authData.user.id,
      email: parsed.data.email,
    },
  };
}
