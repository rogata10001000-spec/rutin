"use server";

import { revalidatePath } from "next/cache";
import { createStaffAccountSchema, resetStaffPasswordSchema, setCastAcceptingSchema, upsertStaffProfileSchema } from "@/schemas/staff";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin, getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import type { StaffGender } from "@/lib/supabase/types";

const TEMPORARY_PASSWORD_LENGTH = 16;
const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%*-_?",
] as const;
const PASSWORD_ALPHABET = PASSWORD_GROUPS.join("");

function getSecureRandomInt(max: number) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random API is unavailable");
  }

  const limit = Math.floor(0x100000000 / max) * max;
  const values = new Uint32Array(1);

  do {
    cryptoApi.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % max;
}

function pickRandomChar(chars: string) {
  return chars[getSecureRandomInt(chars.length)];
}

function shuffleString(value: string) {
  const chars = value.split("");
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = getSecureRandomInt(i + 1);
    const current = chars[i];
    chars[i] = chars[j];
    chars[j] = current;
  }
  return chars.join("");
}

function generateTemporaryPassword() {
  const requiredChars = PASSWORD_GROUPS.map((group) => pickRandomChar(group));
  const remainingChars = Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH - requiredChars.length },
    () => pickRandomChar(PASSWORD_ALPHABET)
  );

  return shuffleString([...requiredChars, ...remainingChars].join(""));
}

function isEmailConflict(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  return (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("duplicate")
  );
}

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
  gender: StaffGender | null;
  birthDate: string | null;
  publicProfile: string | null;
  /** メイトの担当スーパーバイザー（管理者が割当） */
  supervisorId: string | null;
  assignedUserCount: number;
};

export type GetStaffListResult = Result<{ items: StaffMember[] }>;

/**
 * スタッフ一覧取得（管理者: 全件、スーパーバイザー: 管轄のメイトのみ）
 */
export async function getStaffList(): Promise<GetStaffListResult> {
  const actor = await getCurrentStaff();
  if (!actor || (actor.role !== "admin" && actor.role !== "supervisor")) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "アクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  let listQuery = supabase
    .from("staff_profiles")
    .select(
      "id, display_name, role, active, capacity_limit, accepting_new_users, gender, birth_date, public_profile, supervisor_id"
    );

  if (actor.role === "supervisor") {
    listQuery = listQuery.eq("role", "cast").eq("supervisor_id", actor.id);
  }

  const { data, error } = await listQuery.order("role").order("display_name");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  // 各メイトの担当ユーザー数を取得
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
        gender: (row.gender as StaffGender | null) ?? null,
        birthDate: row.birth_date ?? null,
        publicProfile: row.public_profile ?? null,
        supervisorId: row.supervisor_id ?? null,
        assignedUserCount,
      };
    })
  );

  return { ok: true, data: { items } };
}

export type SupervisorOption = {
  id: string;
  displayName: string;
};

export type ListSupervisorOptionsResult = Result<{ supervisors: SupervisorOption[] }>;

/**
 * 担当スーパーバイザー割当用の選択肢（管理者のみ）
 */
export async function listSupervisorOptions(): Promise<ListSupervisorOptionsResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name")
    .eq("role", "supervisor")
    .eq("active", true)
    .order("display_name");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "スーパーバイザー一覧の取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      supervisors: (data ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
      })),
    },
  };
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
  gender: StaffGender | null;
  birthDate: string | null;
  publicProfile: string | null;
  styleSummary: string | null;
};

export type GetStaffDetailResult = Result<{ staff: StaffDetail }>;

/**
 * スタッフ詳細取得（管理画面用。管理者は全件、スーパーバイザーは管轄メイトのみ）
 */
export async function getStaffDetail(staffId: string): Promise<GetStaffDetailResult> {
  const actor = await getCurrentStaff();
  if (!actor || (actor.role !== "admin" && actor.role !== "supervisor")) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "アクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select(
      "id, display_name, role, active, capacity_limit, accepting_new_users, gender, birth_date, public_profile, style_summary, supervisor_id"
    )
    .eq("id", staffId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "スタッフが見つかりません" },
    };
  }

  if (actor.role === "supervisor") {
    if (data.role !== "cast" || data.supervisor_id !== actor.id) {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "このメイト情報にアクセスできません" },
      };
    }
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
        gender: (data.gender as StaffGender | null) ?? null,
        birthDate: data.birth_date ?? null,
        publicProfile: data.public_profile ?? null,
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
  gender?: StaffGender | null;
  birthDate?: string | null;
  publicProfile?: string | null;
  /** 管理者のみ（メイトの担当SV割当） */
  supervisorId?: string | null;
};

export type UpsertStaffProfileResult = Result<{ id: string }>;

/**
 * スタッフプロフィール更新（管理者: 全項目、スーパーバイザー: 管轄メイトのユーザー向けプロフィール文のみ）
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

  const actor = await getCurrentStaff();
  if (!actor) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "ログインが必要です" },
    };
  }

  const supabase = createAdminSupabaseClient();

  if (actor.role === "supervisor") {
    const publicProfile = parsed.data.publicProfile?.trim() || null;
    const { data: updatedRow, error } = await supabase
      .from("staff_profiles")
      .update({ public_profile: publicProfile })
      .eq("id", parsed.data.staffId)
      .eq("role", "cast")
      .eq("supervisor_id", actor.id)
      .select("id")
      .maybeSingle();

    if (error || !updatedRow) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "管轄外のメイトは編集できません。管理者に担当スーパーバイザーの割当を確認してください。",
        },
      };
    }

    await writeAuditLog({
      action: "STAFF_PROFILE_UPDATE",
      targetType: "staff_profiles",
      targetId: parsed.data.staffId,
      success: true,
      metadata: buildAuditMetadata({
        public_profile_only: true,
        edited_by_supervisor_id: actor.id,
      }),
      actorStaffId: actor.id,
    });

    revalidatePath("/admin/staff");
    revalidatePath("/subscribe/cast");

    return { ok: true, data: { id: parsed.data.staffId } };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  let resolvedSupervisorId: string | null = null;
  if (parsed.data.role === "cast") {
    const requested = parsed.data.supervisorId ?? null;
    if (requested) {
      const { data: svRow } = await supabase
        .from("staff_profiles")
        .select("id, role, active")
        .eq("id", requested)
        .maybeSingle();
      if (!svRow || svRow.role !== "supervisor" || !svRow.active) {
        return {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "担当スーパーバイザーの指定が不正です（有効なスーパーバイザーを選んでください）",
          },
        };
      }
      resolvedSupervisorId = requested;
    }
  }

  const { data: updatedRow, error } = await supabase
    .from("staff_profiles")
    .update({
      display_name: parsed.data.displayName,
      role: parsed.data.role,
      capacity_limit: parsed.data.capacityLimit ?? null,
      active: parsed.data.active,
      accepting_new_users: parsed.data.acceptingNewUsers ?? true,
      gender: parsed.data.gender ?? null,
      birth_date: parsed.data.birthDate ?? null,
      public_profile: parsed.data.publicProfile ?? null,
      supervisor_id: parsed.data.role === "cast" ? resolvedSupervisorId : null,
    })
    .eq("id", parsed.data.staffId)
    .select("id")
    .maybeSingle();

  if (error || !updatedRow) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error?.message?.includes("violates")
          ? "更新に失敗しました（データが不正です）"
          : "更新に失敗しました（対象スタッフが見つからないか、保存できませんでした）",
      },
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
  revalidatePath("/subscribe/cast");

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
 * メイトの新規受付状態を変更
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
// スタッフアカウント作成
// =====================================

export type CreateStaffAccountInput = {
  email: string;
  displayName: string;
  role: "cast";
  capacityLimit?: number | null;
  gender?: StaffGender | null;
  birthDate?: string | null;
  publicProfile?: string | null;
};

export type CreateStaffAccountResult = Result<{
  id: string;
  email: string;
  temporaryPassword: string;
}>;

/**
 * 新しいメイトアカウントを作成
 * Supabase Authで即時ログイン可能なユーザーを作成し、staff_profilesにレコードを作成
 */
export async function createStaffAccount(
  input: CreateStaffAccountInput
): Promise<CreateStaffAccountResult> {
  // Zodバリデーション
  const parsed = createStaffAccountSchema.safeParse(input);
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

  try {
    // Admin用Supabaseクライアント（service_role）を使用
    const adminSupabase = createAdminSupabaseClient();
    const temporaryPassword = generateTemporaryPassword();

    // Supabase Authでユーザー作成
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: parsed.data.email,
      password: temporaryPassword,
      email_confirm: true,
    });

    if (authError) {
      // メールが既に使用されている場合
      if (isEmailConflict(authError.message)) {
        return {
          ok: false,
          error: { code: "CONFLICT", message: "このメールアドレスは既に登録されています" },
        };
      }
      console.error("Auth create user error:", authError);
      return {
        ok: false,
        error: { code: "EXTERNAL_API_ERROR", message: "アカウントの作成に失敗しました" },
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
        accepting_new_users: true,
        gender: parsed.data.gender ?? null,
        birth_date: parsed.data.birthDate ?? null,
        public_profile: parsed.data.publicProfile ?? null,
        supervisor_id: null,
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
      action: "STAFF_CREATED",
      targetType: "staff_profiles",
      targetId: authData.user.id,
      success: true,
      metadata: buildAuditMetadata({
        email: parsed.data.email,
        display_name: parsed.data.displayName,
        role: parsed.data.role,
        capacity_limit: parsed.data.capacityLimit,
        password_generated: true,
      }),
    });

    revalidatePath("/admin/staff");
    revalidatePath("/subscribe/cast");

    return {
      ok: true,
      data: {
        id: authData.user.id,
        email: parsed.data.email,
        temporaryPassword,
      },
    };
  } catch (error) {
    console.error("Staff account create unexpected error:", error);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "アカウントの作成に失敗しました" },
    };
  }
}

// =====================================
// スタッフパスワード再設定
// =====================================

export type ResetStaffPasswordInput = {
  staffId: string;
};

export type ResetStaffPasswordResult = Result<{
  staffId: string;
  temporaryPassword: string;
}>;

/**
 * 既存メイトのパスワードを再設定
 * 新しいパスワードは平文保存せず、レスポンスで一度だけ返す
 */
export async function resetStaffPassword(
  input: ResetStaffPasswordInput
): Promise<ResetStaffPasswordResult> {
  const parsed = resetStaffPasswordSchema.safeParse(input);
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

  try {
    const adminSupabase = createAdminSupabaseClient();

    const { data: staff, error: staffError } = await adminSupabase
      .from("staff_profiles")
      .select("id, display_name, role")
      .eq("id", parsed.data.staffId)
      .single();

    if (staffError || !staff || staff.role !== "cast") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "メイトが見つかりません" },
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const { error: authError } = await adminSupabase.auth.admin.updateUserById(
      parsed.data.staffId,
      { password: temporaryPassword }
    );

    if (authError) {
      console.error("Auth password reset error:", authError);
      return {
        ok: false,
        error: { code: "EXTERNAL_API_ERROR", message: "パスワードの再設定に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "STAFF_PASSWORD_RESET",
      targetType: "staff_profiles",
      targetId: parsed.data.staffId,
      success: true,
      metadata: buildAuditMetadata({
        display_name: staff.display_name,
        role: staff.role,
        password_generated: true,
      }),
    });

    return {
      ok: true,
      data: {
        staffId: parsed.data.staffId,
        temporaryPassword,
      },
    };
  } catch (error) {
    console.error("Staff password reset unexpected error:", error);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "パスワードの再設定に失敗しました" },
    };
  }
}
