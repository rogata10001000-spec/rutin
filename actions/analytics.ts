"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "./types";

export type CastWorkload = {
  castId: string;
  castName: string;
  assignedCount: number;
  unrepliedCount: number;
  todayRepliedCount: number;
  todayUnrepliedCount: number;
  avgResponseMinutes: number | null;
  slaComplianceRate: number | null;
  uniformityScore: number | null;
};

export type AnalyticsSummary = {
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  overallSlaComplianceRate: number | null;
  avgResponseMinutes: number | null;
  todayTotalReplied: number;
  todayTotalUnreplied: number;
  castWorkloads: CastWorkload[];
  planBreakdown: { plan: string; count: number; avgResponse: number | null; slaRate: number | null }[];
  recentSlaBreaches: number;
};

export type GetAnalyticsResult = Result<AnalyticsSummary>;

export async function getAnalytics(
  periodDays: number = 7
): Promise<GetAnalyticsResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const todayStart = new Date(todayJst + "T00:00:00+09:00");
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  // ユーザー情報取得
  const { data: users } = await supabase
    .from("end_users")
    .select("id, status, plan_code, assigned_cast_id")
    .neq("status", "incomplete");

  const allUsers = users ?? [];
  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter((u) => u.status === "active").length;
  const trialUsers = allUsers.filter((u) => u.status === "trial").length;

  // レスポンスメトリクス取得（期間内）
  const { data: metrics } = await supabase
    .from("response_metrics")
    .select("*")
    .gte("created_at", periodStart.toISOString());

  const allMetrics = metrics ?? [];

  // 全体SLA遵守率
  const overallSlaComplianceRate =
    allMetrics.length > 0
      ? Math.round(
          (allMetrics.filter((m) => !m.sla_breached).length / allMetrics.length) * 100
        )
      : null;

  // 全体平均レスポンスタイム
  const avgResponseMinutes =
    allMetrics.length > 0
      ? Math.round(
          allMetrics.reduce((sum, m) => sum + m.response_minutes, 0) / allMetrics.length
        )
      : null;

  // 直近のSLA超過数
  const recentSlaBreaches = allMetrics.filter((m) => m.sla_breached).length;

  // 今日のメッセージ取得
  const { data: todayOutMessages } = await supabase
    .from("messages")
    .select("end_user_id")
    .eq("direction", "out")
    .gte("created_at", todayStart.toISOString());

  const todayRepliedUserIds = new Set(
    (todayOutMessages ?? []).map((m) => m.end_user_id)
  );

  const nonPausedUsers = allUsers.filter(
    (u) => u.status !== "paused" && u.status !== "canceled"
  );
  const todayTotalReplied = nonPausedUsers.filter((u) =>
    todayRepliedUserIds.has(u.id)
  ).length;
  const todayTotalUnreplied = nonPausedUsers.length - todayTotalReplied;

  // メイト情報取得
  const { data: casts } = await supabase
    .from("staff_profiles")
    .select("id, display_name")
    .eq("role", "cast")
    .eq("active", true);

  // 未返信ユーザー判定用
  const { data: allMessages } = await supabase
    .from("messages")
    .select("end_user_id, direction, created_at")
    .in(
      "end_user_id",
      allUsers.map((u) => u.id)
    )
    .order("created_at", { ascending: false });

  const messagesMap = new Map<string, typeof allMessages>();
  for (const msg of allMessages ?? []) {
    const existing = messagesMap.get(msg.end_user_id);
    if (existing) {
      existing.push(msg);
    } else {
      messagesMap.set(msg.end_user_id, [msg]);
    }
  }

  // ユーザーごとの未返信状態を計算
  const unrepliedUserIds = new Set<string>();
  for (const user of allUsers) {
    const msgs = messagesMap.get(user.id) ?? [];
    const lastIn = msgs.find((m) => m.direction === "in");
    const lastOut = msgs.find((m) => m.direction === "out");
    if (lastIn && (!lastOut || new Date(lastIn.created_at) > new Date(lastOut.created_at))) {
      unrepliedUserIds.add(user.id);
    }
  }

  // メイト別ワークロード
  const castWorkloads: CastWorkload[] = (casts ?? []).map((cast) => {
    const assigned = allUsers.filter((u) => u.assigned_cast_id === cast.id);
    const activePlusTrialAssigned = assigned.filter(
      (u) => u.status !== "paused" && u.status !== "canceled"
    );
    const unreplied = activePlusTrialAssigned.filter((u) => unrepliedUserIds.has(u.id));
    const todayReplied = activePlusTrialAssigned.filter((u) => todayRepliedUserIds.has(u.id));

    const castMetrics = allMetrics.filter((m) => m.staff_id === cast.id);
    const castAvg =
      castMetrics.length > 0
        ? Math.round(
            castMetrics.reduce((s, m) => s + m.response_minutes, 0) / castMetrics.length
          )
        : null;
    const castSlaRate =
      castMetrics.length > 0
        ? Math.round(
            (castMetrics.filter((m) => !m.sla_breached).length / castMetrics.length) * 100
          )
        : null;

    // 均一性スコア: ユーザーごとのレスポンスタイムの変動係数（CV）を基に計算
    // 100 = 完全に均一、低いほどばらつきが大きい
    let uniformityScore: number | null = null;
    if (castMetrics.length >= 3) {
      const userResponseMap = new Map<string, number[]>();
      for (const m of castMetrics) {
        const existing = userResponseMap.get(m.end_user_id);
        if (existing) {
          existing.push(m.response_minutes);
        } else {
          userResponseMap.set(m.end_user_id, [m.response_minutes]);
        }
      }

      const userAvgs = Array.from(userResponseMap.values()).map(
        (times) => times.reduce((s, t) => s + t, 0) / times.length
      );

      if (userAvgs.length >= 2) {
        const mean = userAvgs.reduce((s, v) => s + v, 0) / userAvgs.length;
        if (mean > 0) {
          const variance =
            userAvgs.reduce((s, v) => s + (v - mean) ** 2, 0) / userAvgs.length;
          const cv = Math.sqrt(variance) / mean;
          uniformityScore = Math.max(0, Math.round(100 - cv * 100));
        }
      }
    }

    return {
      castId: cast.id,
      castName: cast.display_name,
      assignedCount: assigned.length,
      unrepliedCount: unreplied.length,
      todayRepliedCount: todayReplied.length,
      todayUnrepliedCount: activePlusTrialAssigned.length - todayReplied.length,
      avgResponseMinutes: castAvg,
      slaComplianceRate: castSlaRate,
      uniformityScore,
    };
  });

  // プラン別内訳
  const planCodes = ["premium", "standard", "light"];
  const planBreakdown = planCodes.map((plan) => {
    const planUsers = allUsers.filter((u) => u.plan_code === plan);
    const planMetrics = allMetrics.filter((m) => m.plan_code === plan);
    const planAvg =
      planMetrics.length > 0
        ? Math.round(
            planMetrics.reduce((s, m) => s + m.response_minutes, 0) / planMetrics.length
          )
        : null;
    const slaRate =
      planMetrics.length > 0
        ? Math.round(
            (planMetrics.filter((m) => !m.sla_breached).length / planMetrics.length) * 100
          )
        : null;

    return { plan, count: planUsers.length, avgResponse: planAvg, slaRate };
  });

  return {
    ok: true,
    data: {
      totalUsers,
      activeUsers,
      trialUsers,
      overallSlaComplianceRate,
      avgResponseMinutes,
      todayTotalReplied,
      todayTotalUnreplied,
      castWorkloads,
      planBreakdown,
      recentSlaBreaches,
    },
  };
}
