import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";

/**
 * 日次サマリージョブ
 * 毎日22:00 JSTに実行を想定
 *
 * - 今日の対応状況を集計
 * - 未対応ユーザーを検出
 * - SLA超過回数を集計
 * - 監査ログに記録（将来的にSlack/LINE通知を追加）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const now = new Date();
    const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const todayStart = new Date(todayJst + "T00:00:00+09:00");

    // アクティブユーザー取得
    const { data: users } = await supabase
      .from("end_users")
      .select("id, nickname, plan_code, assigned_cast_id, status")
      .in("status", ["trial", "active", "past_due"]);

    const allUsers = users ?? [];
    const userIds = allUsers.map((u) => u.id);

    // 今日送信されたメッセージ
    const { data: todayOutMessages } = await supabase
      .from("messages")
      .select("end_user_id")
      .eq("direction", "out")
      .gte("created_at", todayStart.toISOString())
      .in("end_user_id", userIds);

    const todayRepliedIds = new Set(
      (todayOutMessages ?? []).map((m) => m.end_user_id)
    );

    const unrepliedToday = allUsers.filter((u) => !todayRepliedIds.has(u.id));

    // 今日のSLA超過
    const { data: todayMetrics } = await supabase
      .from("response_metrics")
      .select("sla_breached")
      .gte("created_at", todayStart.toISOString());

    const todaySlaBreaches = (todayMetrics ?? []).filter(
      (m) => m.sla_breached
    ).length;

    // 未報告ユーザー
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const { data: recentCheckins } = await supabase
      .from("checkins")
      .select("end_user_id")
      .gte("date", twoDaysAgo.toISOString().split("T")[0])
      .in("end_user_id", userIds);

    const { data: recentMessages } = await supabase
      .from("messages")
      .select("end_user_id")
      .eq("direction", "in")
      .gte("created_at", twoDaysAgo.toISOString())
      .in("end_user_id", userIds);

    const recentCheckinIds = new Set(
      (recentCheckins ?? []).map((c) => c.end_user_id)
    );
    const recentMessageIds = new Set(
      (recentMessages ?? []).map((m) => m.end_user_id)
    );

    const unreportedUsers = allUsers.filter(
      (u) => !recentCheckinIds.has(u.id) && !recentMessageIds.has(u.id)
    );

    // メイト別集計
    const { data: casts } = await supabase
      .from("staff_profiles")
      .select("id, display_name")
      .eq("role", "cast")
      .eq("active", true);

    const castSummary = (casts ?? []).map((cast) => {
      const assigned = allUsers.filter((u) => u.assigned_cast_id === cast.id);
      const replied = assigned.filter((u) => todayRepliedIds.has(u.id));
      return {
        castName: cast.display_name,
        assigned: assigned.length,
        replied: replied.length,
        unreplied: assigned.length - replied.length,
      };
    });

    const summary = {
      date: todayJst,
      totalActiveUsers: allUsers.length,
      todayReplied: todayRepliedIds.size,
      todayUnreplied: unrepliedToday.length,
      todaySlaBreaches,
      unreportedCount: unreportedUsers.length,
      unrepliedUserNames: unrepliedToday.map((u) => u.nickname).slice(0, 20),
      unreportedUserNames: unreportedUsers.map((u) => u.nickname).slice(0, 20),
      castSummary,
    };

    // 監査ログに保存
    await supabase.from("audit_logs").insert({
      actor_staff_id: null,
      action: "DAILY_SUMMARY_JOB",
      target_type: "system",
      target_id: "daily-summary",
      success: true,
      metadata: summary as unknown as Record<string, unknown>,
    });

    logger.info("Daily summary job completed", summary);

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    logger.error("Daily summary job failed", { error: err });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
