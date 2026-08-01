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

  // 「最終受信/最終送信/本日の送信数」は受信トレイと同じ集計RPCから受け取る。
  // 旧実装は担当ユーザー全員分の messages を無制限に取得してJS側で畳んでいたため、
  // 会話を開くたびに全メッセージ履歴を転送していた（件数に比例して重くなる）。
  const { data: summaries } = await supabase.rpc("inbox_thread_summary", {
    p_user_ids: userIds,
    p_staff_id: staff.id,
    p_today_start: todayStart.toISOString(),
  });

  const summaryMap = new Map((summaries ?? []).map((s) => [s.end_user_id, s]));

  // 未返信（最後の受信のほうが最後の送信より新しい）ユーザーを優先
  for (const user of allUsers) {
    const summary = summaryMap.get(user.id);
    const lastInboundAt = summary?.last_inbound_at ?? null;
    const lastOutboundAt = summary?.last_outbound_at ?? null;
    if (
      lastInboundAt &&
      (!lastOutboundAt || new Date(lastInboundAt) > new Date(lastOutboundAt))
    ) {
      return { ok: true, data: { user: { id: user.id, nickname: user.nickname } } };
    }
  }

  // 未返信なければ今日未送信ユーザーを探す
  const unsentToday = allUsers.find(
    (u) => (summaryMap.get(u.id)?.today_sent_count ?? 0) === 0
  );
  if (unsentToday) {
    return {
      ok: true,
      data: { user: { id: unsentToday.id, nickname: unsentToday.nickname } },
    };
  }

  return { ok: true, data: { user: null } };
}
