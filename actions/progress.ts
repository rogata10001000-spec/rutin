"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { Result } from "./types";

export type TodayProgress = {
  total: number;
  replied: number;
  percentage: number;
};

export type GetTodayProgressResult = Result<TodayProgress>;

/**
 * 今日の対応プログレスを取得（現在のスタッフの担当ユーザー）
 */
export async function getTodayProgress(): Promise<GetTodayProgressResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayStart = new Date(todayJst + "T00:00:00+09:00");

  // Admin/Supervisorは全ユーザー、Castは担当のみ
  let query = supabase
    .from("end_users")
    .select("id")
    .in("status", ["trial", "active", "past_due"]);

  if (staff.role === "cast") {
    query = query.eq("assigned_cast_id", staff.id);
  }

  const { data: users } = await query;
  const allUsers = users ?? [];

  if (allUsers.length === 0) {
    return { ok: true, data: { total: 0, replied: 0, percentage: 0 } };
  }

  const userIds = allUsers.map((u) => u.id);

  const { data: todayOutMessages } = await supabase
    .from("messages")
    .select("end_user_id")
    .eq("direction", "out")
    .gte("created_at", todayStart.toISOString())
    .in("end_user_id", userIds);

  const repliedIds = new Set(
    (todayOutMessages ?? []).map((m) => m.end_user_id)
  );

  const total = allUsers.length;
  const replied = allUsers.filter((u) => repliedIds.has(u.id)).length;
  const percentage = total > 0 ? Math.round((replied / total) * 100) : 0;

  return { ok: true, data: { total, replied, percentage } };
}

export type NextUnrepliedUser = {
  id: string;
  nickname: string;
};

export type GetNextUnrepliedResult = Result<{ user: NextUnrepliedUser | null }>;

/**
 * 次の未対応ユーザーを取得（優先度順で最も高いもの）
 */
export async function getNextUnrepliedUser(
  currentUserId?: string
): Promise<GetNextUnrepliedResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayStart = new Date(todayJst + "T00:00:00+09:00");

  let query = supabase
    .from("end_users")
    .select("id, nickname")
    .in("status", ["trial", "active", "past_due"]);

  if (staff.role === "cast") {
    query = query.eq("assigned_cast_id", staff.id);
  }

  if (currentUserId) {
    query = query.neq("id", currentUserId);
  }

  const { data: users } = await query;
  const allUsers = users ?? [];

  if (allUsers.length === 0) {
    return { ok: true, data: { user: null } };
  }

  const userIds = allUsers.map((u) => u.id);

  // 今日まだ送信していないユーザーを探す
  const { data: todayOutMessages } = await supabase
    .from("messages")
    .select("end_user_id")
    .eq("direction", "out")
    .gte("created_at", todayStart.toISOString())
    .in("end_user_id", userIds);

  const repliedIds = new Set(
    (todayOutMessages ?? []).map((m) => m.end_user_id)
  );

  // 未返信ユーザーを優先
  const { data: allMessages } = await supabase
    .from("messages")
    .select("end_user_id, direction, created_at")
    .in("end_user_id", userIds)
    .order("created_at", { ascending: false });

  const messagesMap = new Map<string, (typeof allMessages extends (infer T)[] | null ? T : never)[]>();
  for (const msg of allMessages ?? []) {
    const existing = messagesMap.get(msg.end_user_id);
    if (existing) {
      existing.push(msg);
    } else {
      messagesMap.set(msg.end_user_id, [msg]);
    }
  }

  // 未返信ユーザーを探す
  for (const user of allUsers) {
    const msgs = messagesMap.get(user.id) ?? [];
    const lastIn = msgs.find((m) => m.direction === "in");
    const lastOut = msgs.find((m) => m.direction === "out");
    if (lastIn && (!lastOut || new Date(lastIn.created_at) > new Date(lastOut.created_at))) {
      return { ok: true, data: { user: { id: user.id, nickname: user.nickname } } };
    }
  }

  // 未返信なければ今日未送信ユーザーを探す
  const unsentToday = allUsers.find((u) => !repliedIds.has(u.id));
  if (unsentToday) {
    return {
      ok: true,
      data: { user: { id: unsentToday.id, nickname: unsentToday.nickname } },
    };
  }

  return { ok: true, data: { user: null } };
}
