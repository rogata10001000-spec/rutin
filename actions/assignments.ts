"use server";

import { revalidatePath } from "next/cache";
import { assignCastSchema } from "@/schemas/assignments";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor, canAccessUser, getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

export type CastOption = {
  id: string;
  displayName: string;
  assignedUserCount: number;
  capacityLimit: number | null;
  acceptingNewUsers: boolean;
};

export type GetCastOptionsResult = Result<{ casts: CastOption[] }>;

/**
 * 担当変更用のキャスト選択肢を取得
 */
export async function getCastOptions(): Promise<GetCastOptionsResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: casts, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, capacity_limit, accepting_new_users, active")
    .eq("role", "cast")
    .eq("active", true)
    .order("display_name");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "キャスト一覧の取得に失敗しました" },
    };
  }

  // 各キャストの担当数を取得
  const castIds = (casts ?? []).map((c) => c.id);
  const { data: assignments } = await supabase
    .from("end_users")
    .select("assigned_cast_id")
    .in("assigned_cast_id", castIds)
    .neq("status", "canceled");

  const countMap = new Map<string, number>();
  (assignments ?? []).forEach((a) => {
    if (a.assigned_cast_id) {
      countMap.set(a.assigned_cast_id, (countMap.get(a.assigned_cast_id) ?? 0) + 1);
    }
  });

  const options: CastOption[] = (casts ?? []).map((c) => ({
    id: c.id,
    displayName: c.display_name,
    assignedUserCount: countMap.get(c.id) ?? 0,
    capacityLimit: c.capacity_limit,
    acceptingNewUsers: c.accepting_new_users,
  }));

  return { ok: true, data: { casts: options } };
}

export type AssignmentHistoryItem = {
  id: string;
  fromCastName: string | null;
  toCastName: string;
  reason: string | null;
  shadowUntil: string | null;
  createdByName: string;
  createdAt: string;
};

export type GetAssignmentHistoryResult = Result<{ history: AssignmentHistoryItem[] }>;

/**
 * 担当変更履歴を取得
 */
export async function getAssignmentHistory(endUserId: string): Promise<GetAssignmentHistoryResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: history, error } = await supabase
    .from("cast_assignments")
    .select(`
      id,
      from_cast_id,
      to_cast_id,
      reason,
      shadow_until,
      created_by,
      created_at,
      from_cast:staff_profiles!cast_assignments_from_cast_id_fkey (
        display_name
      ),
      to_cast:staff_profiles!cast_assignments_to_cast_id_fkey (
        display_name
      ),
      created_by_staff:staff_profiles!cast_assignments_created_by_fkey (
        display_name
      )
    `)
    .eq("end_user_id", endUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "履歴の取得に失敗しました" },
    };
  }

  const items: AssignmentHistoryItem[] = (history ?? []).map((h) => ({
    id: h.id,
    fromCastName: (h.from_cast as unknown as { display_name: string } | null)?.display_name ?? null,
    toCastName: (h.to_cast as unknown as { display_name: string } | null)?.display_name ?? "不明",
    reason: h.reason,
    shadowUntil: h.shadow_until,
    createdByName: (h.created_by_staff as unknown as { display_name: string } | null)?.display_name ?? "不明",
    createdAt: h.created_at,
  }));

  return { ok: true, data: { history: items } };
}

export type AssignCastInput = {
  endUserId: string;
  toCastId: string;
  reason: string;
  shadowUntil?: string;
};

export type AssignCastResult = Result<{ assignmentId: string }>;

/**
 * 担当キャスト変更
 * 権限: Admin/Supervisor
 */
export async function assignCast(input: AssignCastInput): Promise<AssignCastResult> {
  // Zodバリデーション
  const parsed = assignCastSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // 権限チェック
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "担当変更の権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // end_user取得
  const { data: user } = await supabase
    .from("end_users")
    .select("id, assigned_cast_id")
    .eq("id", parsed.data.endUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // toCastが存在するか確認
  const { data: toCast } = await supabase
    .from("staff_profiles")
    .select("id, role")
    .eq("id", parsed.data.toCastId)
    .single();

  if (!toCast) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "指定されたキャストが見つかりません" },
    };
  }

  const fromCastId = user.assigned_cast_id;

  // cast_assignments insert（履歴）
  const { data: assignment, error: assignError } = await supabase
    .from("cast_assignments")
    .insert({
      end_user_id: user.id,
      from_cast_id: fromCastId,
      to_cast_id: parsed.data.toCastId,
      reason: parsed.data.reason,
      shadow_until: parsed.data.shadowUntil ?? null,
      created_by: auth.id,
    })
    .select("id")
    .single();

  if (assignError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "担当履歴の記録に失敗しました" },
    };
  }

  // end_users.assigned_cast_id更新
  const { error: updateError } = await supabase
    .from("end_users")
    .update({ assigned_cast_id: parsed.data.toCastId })
    .eq("id", user.id);

  if (updateError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "担当の更新に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "ASSIGN_CAST",
    targetType: "cast_assignments",
    targetId: assignment.id,
    success: true,
    metadata: buildAuditMetadata(
      {
        end_user_id: user.id,
        from_cast_id: fromCastId,
        to_cast_id: parsed.data.toCastId,
        shadow_until: parsed.data.shadowUntil,
      },
      { reason: parsed.data.reason }
    ),
  });

  revalidatePath("/inbox");
  revalidatePath("/users");
  revalidatePath(`/users/${user.id}`);
  revalidatePath(`/chat/${user.id}`);

  return { ok: true, data: { assignmentId: assignment.id } };
}

export type CreateShadowDraftInput = {
  endUserId: string;
  body: string;
};

export type CreateShadowDraftResult = Result<{ draftId: string }>;

/**
 * Shadow下書き作成
 * 権限: Shadow期間中のCastのみ
 */
export async function createShadowDraft(
  input: CreateShadowDraftInput
): Promise<CreateShadowDraftResult> {
  if (!input.body?.trim()) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "本文を入力してください" },
    };
  }

  // 権限チェック（Shadow期間中のみ）
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  // Shadowでなければ下書きを作成する理由がない（通常送信すべき）
  if (!access.isShadow) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Shadow期間中のみ下書きを作成できます" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: draft, error } = await supabase
    .from("shadow_drafts")
    .insert({
      end_user_id: input.endUserId,
      created_by: access.id,
      body: input.body.trim(),
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "下書きの保存に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "CREATE_SHADOW_DRAFT",
    targetType: "shadow_drafts",
    targetId: draft.id,
    success: true,
    metadata: {
      end_user_id: input.endUserId,
      body_length: input.body.length,
    },
  });

  revalidatePath(`/chat/${input.endUserId}`);

  return { ok: true, data: { draftId: draft.id } };
}

export type ShadowDraft = {
  id: string;
  body: string;
  createdByName: string;
  createdAt: string;
};

export type GetShadowDraftsResult = Result<{ drafts: ShadowDraft[] }>;

/**
 * Shadow下書き一覧取得
 */
export async function getShadowDrafts(endUserId: string): Promise<GetShadowDraftsResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: drafts, error } = await supabase
    .from("shadow_drafts")
    .select(`
      id,
      body,
      created_at,
      staff_profiles!shadow_drafts_created_by_fkey (
        display_name
      )
    `)
    .eq("end_user_id", endUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "下書きの取得に失敗しました" },
    };
  }

  const items: ShadowDraft[] = (drafts ?? []).map((d) => ({
    id: d.id,
    body: d.body,
    createdByName: (d.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? "不明",
    createdAt: d.created_at,
  }));

  return { ok: true, data: { drafts: items } };
}

export type CheckShadowAccessResult = Result<{ isShadow: boolean; shadowUntil: string | null }>;

/**
 * Shadowアクセス状態を確認
 */
export async function checkShadowAccess(endUserId: string): Promise<CheckShadowAccessResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 最新のassignment（to_cast_idが現在のスタッフではない場合）を確認
  const { data: assignment } = await supabase
    .from("cast_assignments")
    .select("shadow_until, to_cast_id")
    .eq("end_user_id", endUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Shadow期間中かどうか
  const isShadow = access.isShadow;
  const shadowUntil = assignment?.shadow_until ?? null;

  return {
    ok: true,
    data: { isShadow, shadowUntil },
  };
}
