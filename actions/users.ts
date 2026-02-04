"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff, canAccessUser } from "@/lib/auth";
import { Result } from "./types";
import type { PlanCode, SubscriptionStatus, CheckinStatus } from "@/lib/supabase/types";
import { updateEndUserSchema, createEndUserSchema, type UpdateEndUserInput, type CreateEndUserInput } from "@/schemas/users";
import { writeAuditLog } from "@/lib/audit";

export type UserListItem = {
  id: string;
  nickname: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  assignedCastId: string | null;
  assignedCastName: string | null;
  tags: string[];
  createdAt: string;
};

export type SearchUsersInput = {
  query?: string;
  filters?: {
    planCodes?: string[];
    statuses?: string[];
    assignedCastId?: string;
  };
};

export type SearchUsersResult = Result<{ items: UserListItem[] }>;

/**
 * ユーザー検索
 */
export async function searchUsers(
  input: SearchUsersInput = {}
): Promise<SearchUsersResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { query, filters } = input;

  let dbQuery = supabase
    .from("end_users")
    .select(`
      id,
      nickname,
      plan_code,
      status,
      assigned_cast_id,
      tags,
      created_at,
      staff_profiles!end_users_assigned_cast_id_fkey (
        display_name
      )
    `)
    .neq("status", "incomplete")
    .order("created_at", { ascending: false });

  if (query) {
    dbQuery = dbQuery.ilike("nickname", `%${query}%`);
  }
  if (filters?.planCodes?.length) {
    dbQuery = dbQuery.in("plan_code", filters.planCodes);
  }
  if (filters?.statuses?.length) {
    dbQuery = dbQuery.in("status", filters.statuses as SubscriptionStatus[]);
  }
  if (filters?.assignedCastId) {
    dbQuery = dbQuery.eq("assigned_cast_id", filters.assignedCastId);
  }

  const { data: users, error } = await dbQuery.limit(100);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: UserListItem[] = (users ?? []).map((user) => {
    const staffProfile = user.staff_profiles as unknown as { display_name: string } | null;
    return {
      id: user.id,
      nickname: user.nickname,
      planCode: user.plan_code as PlanCode,
      status: user.status as SubscriptionStatus,
      assignedCastId: user.assigned_cast_id,
      assignedCastName: staffProfile?.display_name ?? null,
      tags: user.tags ?? [],
      createdAt: user.created_at,
    };
  });

  return { ok: true, data: { items } };
}

export type PointTransaction = {
  id: string;
  deltaPoints: number;
  reason: string;
  createdAt: string;
};

export type SubscriptionHistory = {
  id: string;
  planCode: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  createdAt: string;
};

export type UserDetail = {
  id: string;
  lineUserId: string;
  nickname: string;
  birthday: string | null;
  status: SubscriptionStatus;
  planCode: PlanCode;
  assignedCastId: string | null;
  assignedCastName: string | null;
  tags: string[];
  createdAt: string;
  subscription: {
    id: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  pointBalance: number;
  pointTransactions: PointTransaction[];
  subscriptionHistory: SubscriptionHistory[];
  recentCheckins: { date: string; status: CheckinStatus }[];
  recentGifts: { sentAt: string; giftName: string; costPoints: number }[];
};

export type GetUserDetailInput = {
  endUserId: string;
};

export type GetUserDetailResult = Result<UserDetail>;

/**
 * ユーザー詳細取得
 */
export async function getUserDetail(
  input: GetUserDetailInput
): Promise<GetUserDetailResult> {
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // ユーザー基本情報
  const { data: user, error: userError } = await supabase
    .from("end_users")
    .select(`
      id,
      line_user_id,
      nickname,
      birthday,
      status,
      plan_code,
      assigned_cast_id,
      tags,
      created_at,
      staff_profiles!end_users_assigned_cast_id_fkey (
        display_name
      )
    `)
    .eq("id", input.endUserId)
    .single();

  if (userError || !user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // サブスクリプション（最新）
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, stripe_customer_id, status, current_period_end, cancel_at_period_end")
    .eq("end_user_id", input.endUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // サブスクリプション履歴（全件）
  const { data: subscriptionHistory } = await supabase
    .from("subscriptions")
    .select("id, plan_code, status, current_period_end, created_at")
    .eq("end_user_id", input.endUserId)
    .order("created_at", { ascending: false })
    .limit(10);

  // ポイント残高と取引履歴
  const { data: ledger } = await supabase
    .from("user_point_ledger")
    .select("id, delta_points, reason, created_at")
    .eq("end_user_id", input.endUserId)
    .order("created_at", { ascending: false })
    .limit(50);

  const pointBalance = (ledger ?? []).reduce((sum, row) => sum + row.delta_points, 0);

  // 直近7日のチェックイン
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("date, status")
    .eq("end_user_id", input.endUserId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: false });

  // 直近のギフト
  const { data: giftSends } = await supabase
    .from("gift_sends")
    .select(`
      sent_at,
      cost_points,
      gift_catalog (
        name
      )
    `)
    .eq("end_user_id", input.endUserId)
    .order("sent_at", { ascending: false })
    .limit(10);

  const staffProfile = user.staff_profiles as unknown as { display_name: string } | null;

  const REASON_LABELS: Record<string, string> = {
    purchase: "購入",
    gift_redeem: "ギフト交換",
    refund: "返金",
    chargeback: "チャージバック",
    admin_adjust: "管理者調整",
  };

  return {
    ok: true,
    data: {
      id: user.id,
      lineUserId: user.line_user_id,
      nickname: user.nickname,
      birthday: user.birthday,
      status: user.status as SubscriptionStatus,
      planCode: user.plan_code as PlanCode,
      assignedCastId: user.assigned_cast_id,
      assignedCastName: staffProfile?.display_name ?? null,
      tags: user.tags ?? [],
      createdAt: user.created_at,
      subscription: subscription
        ? {
            id: subscription.id,
            stripeSubscriptionId: subscription.stripe_subscription_id,
            stripeCustomerId: subscription.stripe_customer_id,
            status: subscription.status as SubscriptionStatus,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          }
        : null,
      pointBalance,
      pointTransactions: (ledger ?? []).slice(0, 20).map((l) => ({
        id: l.id,
        deltaPoints: l.delta_points,
        reason: REASON_LABELS[l.reason] ?? l.reason,
        createdAt: l.created_at,
      })),
      subscriptionHistory: (subscriptionHistory ?? []).map((s) => ({
        id: s.id,
        planCode: s.plan_code,
        status: s.status as SubscriptionStatus,
        currentPeriodEnd: s.current_period_end,
        createdAt: s.created_at,
      })),
      recentCheckins: (checkins ?? []).map((c) => ({
        date: c.date,
        status: c.status as CheckinStatus,
      })),
      recentGifts: (giftSends ?? []).map((g) => ({
        sentAt: g.sent_at,
        giftName: (g.gift_catalog as unknown as { name: string } | null)?.name ?? "不明",
        costPoints: g.cost_points,
      })),
    },
  };
}

export type UpdateEndUserResult = Result<{ id: string }>;

/**
 * ユーザー情報更新（Admin/Supervisor）
 */
export async function updateEndUser(
  input: UpdateEndUserInput
): Promise<UpdateEndUserResult> {
  // 権限チェック
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }
  if (staff.role !== "admin" && staff.role !== "supervisor") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // 入力バリデーション
  const parsed = updateEndUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.errors[0]?.message ?? "入力内容を確認してください" },
    };
  }

  const { endUserId, nickname, birthday, tags } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // 現在の値を取得（監査用）
  const { data: currentUser, error: fetchError } = await supabase
    .from("end_users")
    .select("nickname, birthday, tags")
    .eq("id", endUserId)
    .single();

  if (fetchError || !currentUser) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // 更新
  const { error: updateError } = await supabase
    .from("end_users")
    .update({
      nickname,
      birthday: birthday ?? null,
      tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", endUserId);

  if (updateError) {
    console.error("[updateEndUser] Update failed:", updateError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "USER_PROFILE_UPDATE",
    targetType: "end_users",
    targetId: endUserId,
    success: true,
    metadata: {
      before: {
        nickname: currentUser.nickname,
        birthday: currentUser.birthday,
        tags: currentUser.tags,
      },
      after: {
        nickname,
        birthday: birthday ?? null,
        tags,
      },
    },
  });

  return { ok: true, data: { id: endUserId } };
}

export type CreateEndUserResult = Result<{ id: string }>;

/**
 * エンドユーザー手動作成（Admin/Supervisor）
 * テスト用・運用用にLINE経由以外でユーザーを作成
 */
export async function createEndUser(
  input: CreateEndUserInput
): Promise<CreateEndUserResult> {
  // 権限チェック
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }
  if (staff.role !== "admin" && staff.role !== "supervisor") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // 入力バリデーション
  const parsed = createEndUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.errors[0]?.message ?? "入力内容を確認してください" },
    };
  }

  const { lineUserId, nickname, planCode, assignedCastId } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // LINE User IDの重複チェック
  const { data: existing } = await supabase
    .from("end_users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .single();

  if (existing) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "このLINE User IDは既に登録されています" },
    };
  }

  // キャストが存在するか確認
  if (assignedCastId) {
    const { data: cast } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("id", assignedCastId)
      .eq("active", true)
      .single();

    if (!cast) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "指定されたキャストが見つかりません" },
      };
    }
  }

  // ユーザー作成
  const { data: newUser, error: createError } = await supabase
    .from("end_users")
    .insert({
      line_user_id: lineUserId,
      nickname,
      plan_code: planCode,
      assigned_cast_id: assignedCastId ?? null,
      status: "active", // 手動作成は即時有効
    })
    .select("id")
    .single();

  if (createError) {
    console.error("[createEndUser] Create failed:", createError);
    if (createError.code === "23505") {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "このLINE User IDは既に登録されています" },
      };
    }
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ユーザーの作成に失敗しました" },
    };
  }

  // 担当を設定した場合は履歴も作成
  if (assignedCastId) {
    await supabase.from("cast_assignments").insert({
      end_user_id: newUser.id,
      from_cast_id: null,
      to_cast_id: assignedCastId,
      reason: "初回担当設定（手動作成）",
      created_by: staff.id,
    });
  }

  // 監査ログ
  await writeAuditLog({
    action: "USER_CREATE",
    targetType: "end_users",
    targetId: newUser.id,
    success: true,
    metadata: {
      line_user_id: lineUserId,
      nickname,
      plan_code: planCode,
      assigned_cast_id: assignedCastId ?? null,
    },
  });

  return { ok: true, data: { id: newUser.id } };
}
