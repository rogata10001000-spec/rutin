"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { Result } from "./types";
import type { SubscriptionStatus } from "@/lib/supabase/types";
import {
  calculateSlaRemaining,
  isUnreported,
  calculateInboxPriority,
  hasSentMessageToday,
} from "@/lib/calculations";

export type InboxItem = {
  id: string;
  nickname: string;
  planCode: "light" | "standard" | "premium";
  status: "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete";
  assignedCastId: string | null;
  assignedCastName: string | null;
  tags: string[];
  priorityScore: number;
  hasRisk: boolean;
  riskLevel: number | null;
  lastUserMessageAt: string | null;
  lastCastMessageAt: string | null;
  unrepliedMinutes: number | null;
  slaRemainingMinutes: number | null;
  slaWarningMinutes: number;
  isUnreported: boolean;
  lastCheckinDate: string | null;
  birthday: string | null;
  isBirthdayToday: boolean;
  // 新しいフィールド
  hasUnrepliedMessage: boolean;
  hasSentTodayMessage: boolean;
  todaySentCount: number;
  replyStatus: "unreplied" | "not_sent_today" | "replied";
};

export type InboxFilters = {
  planCodes?: string[];
  statuses?: string[];
  assignedCastId?: string;
  hasRisk?: boolean;
  isUnreported?: boolean;
  // 新しいフィルタ
  replyStatus?: "unreplied" | "not_sent_today" | "all";
  hasUnassigned?: boolean;
  sortBy?: "priority" | "last_message" | "nickname";
};

export type GetInboxItemsInput = {
  filters?: InboxFilters;
};

export type InboxSummary = {
  total: number;
  unreplied: number;
  notSentToday: number;
  replied: number;
};

export type GetInboxItemsResult = Result<{ items: InboxItem[]; summary: InboxSummary }>;

// プラン別SLA設定
const planSlaConfig = {
  light: { slaMinutes: 1440, warningMinutes: 240 },
  standard: { slaMinutes: 720, warningMinutes: 120 },
  premium: { slaMinutes: 120, warningMinutes: 30 },
};

// ヘルパー関数: メッセージをユーザーIDごとにグループ化
function groupByUserId<T extends { end_user_id: string }>(
  items: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const existing = map.get(item.end_user_id);
    if (existing) {
      existing.push(item);
    } else {
      map.set(item.end_user_id, [item]);
    }
  }
  return map;
}

/**
 * Inbox一覧取得（最適化版）
 * 権限: Admin/Supervisor全件、Cast担当のみ
 * 
 * パフォーマンス改善:
 * - 一括クエリでメッセージ、チェックイン、リスクフラグを取得
 * - N+1問題を解消
 */
export async function getInboxItems(
  input: GetInboxItemsInput = {}
): Promise<GetInboxItemsResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { filters } = input;

  // ユーザー一覧取得（RLSで自動フィルタ）
  let query = supabase
    .from("end_users")
    .select(`
      id,
      nickname,
      plan_code,
      status,
      assigned_cast_id,
      tags,
      birthday,
      paused_priority_penalty,
      staff_profiles!end_users_assigned_cast_id_fkey (
        display_name
      )
    `)
    .neq("status", "incomplete"); // 未契約は除外

  // フィルタ適用
  if (filters?.planCodes?.length) {
    query = query.in("plan_code", filters.planCodes);
  }
  if (filters?.statuses?.length) {
    query = query.in("status", filters.statuses as SubscriptionStatus[]);
  }
  if (filters?.assignedCastId) {
    query = query.eq("assigned_cast_id", filters.assignedCastId);
  }
  if (filters?.hasUnassigned) {
    query = query.is("assigned_cast_id", null);
  }

  const { data: users, error: usersError } = await query;

  if (usersError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  if (!users || users.length === 0) {
    return {
      ok: true,
      data: {
        items: [],
        summary: { total: 0, unreplied: 0, notSentToday: 0, replied: 0 },
      },
    };
  }

  const now = new Date();
  const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayStart = new Date(todayJst + "T00:00:00+09:00");

  const userIds = users.map((u) => u.id);

  // ===== 一括クエリで関連データを取得 =====
  
  // 全メッセージを一括取得（ユーザーメッセージとキャスト返信両方）
  const { data: allMessages } = await supabase
    .from("messages")
    .select("end_user_id, direction, created_at")
    .in("end_user_id", userIds)
    .order("created_at", { ascending: false });

  // 今日のキャスト送信メッセージを一括取得
  const { data: todayMessages } = await supabase
    .from("messages")
    .select("end_user_id")
    .in("end_user_id", userIds)
    .eq("direction", "out")
    .gte("created_at", todayStart.toISOString());

  // 全チェックインを一括取得
  const { data: allCheckins } = await supabase
    .from("checkins")
    .select("end_user_id, date")
    .in("end_user_id", userIds)
    .order("date", { ascending: false });

  // 全リスクフラグを一括取得（openのみ）
  const { data: allRiskFlags } = await supabase
    .from("risk_flags")
    .select("end_user_id, risk_level")
    .in("end_user_id", userIds)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // ===== データをユーザーIDでグループ化 =====
  
  const messagesMap = groupByUserId(allMessages ?? []);
  const checkinsMap = groupByUserId(
    (allCheckins ?? []).map((c) => ({ ...c, end_user_id: c.end_user_id }))
  );
  const riskFlagsMap = groupByUserId(
    (allRiskFlags ?? []).map((r) => ({ ...r, end_user_id: r.end_user_id }))
  );
  
  // 今日の送信数をカウント
  const todaySentCountMap = new Map<string, number>();
  (todayMessages ?? []).forEach((m) => {
    todaySentCountMap.set(m.end_user_id, (todaySentCountMap.get(m.end_user_id) ?? 0) + 1);
  });

  // ===== 各ユーザーのデータを処理 =====
  
  const items: InboxItem[] = users.map((user) => {
    const userMessages = messagesMap.get(user.id) ?? [];
    const userCheckins = checkinsMap.get(user.id) ?? [];
    const userRiskFlags = riskFlagsMap.get(user.id) ?? [];

    // 最後のユーザーメッセージを取得
    const lastUserMsg = userMessages.find((m) => m.direction === "in");
    // 最後のキャスト返信を取得
    const lastCastMsg = userMessages.find((m) => m.direction === "out");
    // 最後のチェックイン
    const lastCheckin = userCheckins[0];
    // リスクフラグ
    const riskFlag = userRiskFlags[0];

    const planCode = user.plan_code as "light" | "standard" | "premium";
    const slaConfig = planSlaConfig[planCode] ?? planSlaConfig.standard;

    // 未返信判定・時間計算
    let unrepliedMinutes: number | null = null;
    let slaRemainingMinutes: number | null = null;
    let hasUnrepliedMessage = false;

    if (lastUserMsg?.created_at) {
      const lastMsgTime = new Date(lastUserMsg.created_at);
      const lastReplyTime = lastCastMsg?.created_at
        ? new Date(lastCastMsg.created_at)
        : null;

      // 最後のユーザーメッセージが最後の返信より新しい場合、未返信
      if (!lastReplyTime || lastMsgTime > lastReplyTime) {
        hasUnrepliedMessage = true;
        unrepliedMinutes = Math.floor(
          (now.getTime() - lastMsgTime.getTime()) / (1000 * 60)
        );
        slaRemainingMinutes = calculateSlaRemaining(
          lastMsgTime,
          slaConfig.slaMinutes,
          now
        );
      }
    }

    // 今日送信したかどうか
    const lastReplyTime = lastCastMsg?.created_at ? new Date(lastCastMsg.created_at) : null;
    const sentTodayMessage = hasSentMessageToday(lastReplyTime, now);

    // 返信状態を決定
    let replyStatus: InboxItem["replyStatus"];
    if (hasUnrepliedMessage) {
      replyStatus = "unreplied";
    } else if (!sentTodayMessage) {
      replyStatus = "not_sent_today";
    } else {
      replyStatus = "replied";
    }

    // 未報告判定
    const lastCheckinDate = lastCheckin?.date
      ? new Date(lastCheckin.date + "T00:00:00")
      : null;
    const lastMessageDate = lastUserMsg?.created_at
      ? new Date(lastUserMsg.created_at)
      : null;
    const unreported = isUnreported(lastCheckinDate, lastMessageDate, 2, now);

    // 誕生日判定
    const birthday = user.birthday;
    let isBirthdayToday = false;
    if (birthday) {
      const birthdayMd = birthday.slice(5); // MM-DD
      const todayMd = todayJst.slice(5);
      isBirthdayToday = birthdayMd === todayMd;
    }

    // 優先度スコア計算（改善版）
    const priorityScore = calculateInboxPriority({
      hasRisk: !!riskFlag,
      slaRemainingMinutes,
      slaWarningMinutes: slaConfig.warningMinutes,
      isUnreported: unreported,
      isPaused: user.status === "paused",
      planPriorityLevel:
        planCode === "premium" ? 1 : planCode === "standard" ? 2 : 3,
      // 新しいパラメータ
      hasUnrepliedMessage,
      hasSentTodayMessage: sentTodayMessage,
      lastMessageTimestamp: lastUserMsg?.created_at
        ? new Date(lastUserMsg.created_at).getTime()
        : undefined,
    });

    const staffProfile = user.staff_profiles as unknown as { display_name: string } | null;

    return {
      id: user.id,
      nickname: user.nickname,
      planCode,
      status: user.status as InboxItem["status"],
      assignedCastId: user.assigned_cast_id,
      assignedCastName: staffProfile?.display_name ?? null,
      tags: user.tags ?? [],
      priorityScore,
      hasRisk: !!riskFlag,
      riskLevel: riskFlag?.risk_level ?? null,
      lastUserMessageAt: lastUserMsg?.created_at ?? null,
      lastCastMessageAt: lastCastMsg?.created_at ?? null,
      unrepliedMinutes,
      slaRemainingMinutes,
      slaWarningMinutes: slaConfig.warningMinutes,
      isUnreported: unreported,
      lastCheckinDate: lastCheckin?.date ?? null,
      birthday,
      isBirthdayToday,
      // 新しいフィールド
      hasUnrepliedMessage,
      hasSentTodayMessage: sentTodayMessage,
      todaySentCount: todaySentCountMap.get(user.id) ?? 0,
      replyStatus,
    };
  });

  // サマリー計算
  const summary: InboxSummary = {
    total: items.length,
    unreplied: items.filter((i) => i.replyStatus === "unreplied").length,
    notSentToday: items.filter((i) => i.replyStatus === "not_sent_today").length,
    replied: items.filter((i) => i.replyStatus === "replied").length,
  };

  // フィルタ（クライアント側）
  let filteredItems = items;
  
  // 返信状態フィルタ
  if (filters?.replyStatus && filters.replyStatus !== "all") {
    if (filters.replyStatus === "unreplied") {
      filteredItems = filteredItems.filter((item) => item.hasUnrepliedMessage);
    } else if (filters.replyStatus === "not_sent_today") {
      filteredItems = filteredItems.filter(
        (item) => !item.hasUnrepliedMessage && !item.hasSentTodayMessage
      );
    }
  }
  
  if (filters?.hasRisk) {
    filteredItems = filteredItems.filter((item) => item.hasRisk);
  }
  if (filters?.isUnreported) {
    filteredItems = filteredItems.filter((item) => item.isUnreported);
  }

  // ソート
  const sortBy = filters?.sortBy ?? "priority";
  if (sortBy === "priority") {
    filteredItems.sort((a, b) => b.priorityScore - a.priorityScore);
  } else if (sortBy === "last_message") {
    filteredItems.sort((a, b) => {
      const aTime = a.lastUserMessageAt ? new Date(a.lastUserMessageAt).getTime() : 0;
      const bTime = b.lastUserMessageAt ? new Date(b.lastUserMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  } else if (sortBy === "nickname") {
    filteredItems.sort((a, b) => a.nickname.localeCompare(b.nickname, "ja"));
  }

  return { ok: true, data: { items: filteredItems, summary } };
}
