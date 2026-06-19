"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessUser } from "@/lib/auth";
import { Result } from "./types";

export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  sentByStaffName: string | null;
  sentAsProxy: boolean;
  createdAt: string;
};

export type ChatSideInfo = {
  userId: string;
  nickname: string;
  planCode: string;
  status: string;
  birthday: string | null;
  assignedCastName: string | null;
  lineAccountName: string | null;
  pointBalance: number;
  pinnedMemos: { id: string; category: string; body: string }[];
  recentCheckins: { date: string; status: string }[];
};

export type GetChatThreadInput = {
  endUserId: string;
  cursor?: string;
  limit?: number;
};

export type GetChatThreadResult = Result<{
  messages: Message[];
  nextCursor: string | null;
  sideInfo: ChatSideInfo;
}>;

/**
 * チャットスレッド取得
 */
export async function getChatThread(
  input: GetChatThreadInput
): Promise<GetChatThreadResult> {
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const limit = input.limit ?? 50;

  // メッセージ取得
  let query = supabase
    .from("messages")
    .select(`
      id,
      direction,
      body,
      sent_as_proxy,
      created_at,
      staff_profiles!messages_sent_by_staff_id_fkey (
        display_name
      )
    `)
    .eq("end_user_id", input.endUserId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (input.cursor) {
    query = query.lt("created_at", input.cursor);
  }

  const { data: messagesData, error: msgError } = await query;

  if (msgError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メッセージの取得に失敗しました" },
    };
  }

  const hasMore = (messagesData?.length ?? 0) > limit;
  const messages: Message[] = (messagesData ?? [])
    .slice(0, limit)
    .map((msg) => ({
      id: msg.id,
      direction: msg.direction as "in" | "out",
      body: msg.body,
      sentByStaffName: (msg.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
      sentAsProxy: msg.sent_as_proxy,
      createdAt: msg.created_at,
    }))
    .reverse(); // 古い順に並び替え

  const nextCursor = hasMore ? messagesData?.[limit]?.created_at ?? null : null;

  // サイド情報取得
  const { data: user } = await supabase
    .from("end_users")
    .select(`
      id,
      nickname,
      plan_code,
      status,
      birthday,
      assigned_cast_id,
      primary_line_account_id,
      staff_profiles!end_users_assigned_cast_id_fkey (
        display_name
      ),
      line_official_accounts!end_users_primary_line_account_id_fkey (
        name
      )
    `)
    .eq("id", input.endUserId)
    .single();

  // ポイント残高
  const { data: ledger } = await supabase
    .from("user_point_ledger")
    .select("delta_points")
    .eq("end_user_id", input.endUserId);

  const pointBalance = (ledger ?? []).reduce((sum, row) => sum + row.delta_points, 0);

  // ピン留めメモ
  const { data: pinnedMemos } = await supabase
    .from("memos")
    .select("id, category, latest_body")
    .eq("end_user_id", input.endUserId)
    .eq("pinned", true)
    .order("updated_at", { ascending: false });

  // 直近7日のチェックイン
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("date, status")
    .eq("end_user_id", input.endUserId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: false });

  const staffProfile = user?.staff_profiles as unknown as { display_name: string } | null;
  const lineAccount = user?.line_official_accounts as unknown as { name: string } | null;

  return {
    ok: true,
    data: {
      messages,
      nextCursor,
      sideInfo: {
        userId: user?.id ?? input.endUserId,
        nickname: user?.nickname ?? "不明",
        planCode: user?.plan_code ?? "standard",
        status: user?.status ?? "active",
        birthday: user?.birthday ?? null,
        assignedCastName: staffProfile?.display_name ?? null,
        lineAccountName: lineAccount?.name ?? null,
        pointBalance,
        pinnedMemos: (pinnedMemos ?? []).map((m) => ({
          id: m.id,
          category: m.category,
          body: m.latest_body,
        })),
        recentCheckins: (checkins ?? []).map((c) => ({
          date: c.date,
          status: c.status,
        })),
      },
    },
  };
}

export type GetMessagesSinceInput = {
  endUserId: string;
  sinceIso: string;
};

export type GetMessagesSinceResult = Result<{ messages: Message[] }>;

/**
 * 指定時刻より後のメッセージのみを取得する軽量フェッチ。
 * Realtime はモバイルでタブをバックグラウンドにすると WebSocket が切れて
 * 取りこぼすことがあるため、フォアグラウンド復帰時の差分取得に使う。
 */
export async function getMessagesSince(
  input: GetMessagesSinceInput
): Promise<GetMessagesSinceResult> {
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("messages")
    .select(`
      id,
      direction,
      body,
      sent_as_proxy,
      created_at,
      staff_profiles!messages_sent_by_staff_id_fkey (
        display_name
      )
    `)
    .eq("end_user_id", input.endUserId)
    .gt("created_at", input.sinceIso)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メッセージの取得に失敗しました" },
    };
  }

  const messages: Message[] = (data ?? []).map((msg) => ({
    id: msg.id,
    direction: msg.direction as "in" | "out",
    body: msg.body,
    sentByStaffName:
      (msg.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
    sentAsProxy: msg.sent_as_proxy,
    createdAt: msg.created_at,
  }));

  return { ok: true, data: { messages } };
}
