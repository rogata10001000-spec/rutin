import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { calculateSlaRemaining } from "@/lib/calculations";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";

/**
 * SLAアラートジョブ
 * 5分間隔で実行を想定（Vercel Cron / 外部スケジューラからGETで呼び出し）
 *
 * - SLA警告圏内のユーザーを検出
 * - SLA超過のユーザーを検出
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

    const { data: users } = await supabase
      .from("end_users")
      .select("id, nickname, plan_code, assigned_cast_id, status")
      .in("status", ["trial", "active", "past_due"])
      .not("assigned_cast_id", "is", null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, alerts: 0 });
    }

    const userIds = users.map((u) => u.id);

    const { data: plans } = await supabase
      .from("plans")
      .select("plan_code, reply_sla_minutes, sla_warning_minutes");
    const planSlaConfig = new Map(
      (plans ?? []).map((plan) => [
        plan.plan_code,
        {
          slaMinutes: plan.reply_sla_minutes,
          warningMinutes: plan.sla_warning_minutes,
        },
      ])
    );

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

    const slaWarnings: { userId: string; nickname: string; castId: string; remaining: number; plan: string }[] = [];
    const slaBreaches: { userId: string; nickname: string; castId: string; plan: string }[] = [];

    for (const user of users) {
      const msgs = messagesMap.get(user.id) ?? [];
      const lastIn = msgs.find((m) => m.direction === "in");
      const lastOut = msgs.find((m) => m.direction === "out");

      if (!lastIn) continue;

      const lastInTime = new Date(lastIn.created_at);
      const lastOutTime = lastOut ? new Date(lastOut.created_at) : null;

      if (lastOutTime && lastOutTime > lastInTime) continue;

      const planCode = user.plan_code ?? "standard";
      const config = planSlaConfig.get(planCode) ?? planSlaConfig.get("standard");
      if (!config) continue;
      const remaining = calculateSlaRemaining(lastInTime, config.slaMinutes, now);

      if (remaining === null) continue;

      if (remaining === 0) {
        slaBreaches.push({
          userId: user.id,
          nickname: user.nickname,
          castId: user.assigned_cast_id!,
          plan: planCode,
        });
      } else if (remaining <= config.warningMinutes) {
        slaWarnings.push({
          userId: user.id,
          nickname: user.nickname,
          castId: user.assigned_cast_id!,
          remaining,
          plan: planCode,
        });
      }
    }

    // 監査ログに記録
    if (slaBreaches.length > 0 || slaWarnings.length > 0) {
      await supabase.from("audit_logs").insert({
        actor_staff_id: null,
        action: "SLA_ALERT_JOB",
        target_type: "system",
        target_id: "sla-alert",
        success: true,
        metadata: {
          breaches: slaBreaches.length,
          warnings: slaWarnings.length,
          breach_users: slaBreaches.map((b) => b.nickname),
          warning_users: slaWarnings.map((w) => `${w.nickname}(残${w.remaining}分)`),
        },
      });
    }

    logger.info("SLA alert job completed", {
      breaches: slaBreaches.length,
      warnings: slaWarnings.length,
    });

    return NextResponse.json({
      ok: true,
      breaches: slaBreaches.length,
      warnings: slaWarnings.length,
      breachDetails: slaBreaches,
      warningDetails: slaWarnings,
    });
  } catch (err) {
    logger.error("SLA alert job failed", { error: err });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
