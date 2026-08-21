import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

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
  if (!isAuthorizedCronRequest(request)) {
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

    // LINE月間メッセージ枠の上限接近チェック。
    // 管理画面（/admin/line-accounts）にも表示しているが、画面を開かない日が続くと
    // 気づけない。上限到達＝通知・送信の無音全停止なので、警告圏に入ったら
    // 運営LINEへ自動で知らせる（同日・同アカウント・同レベルは1回に制限）。
    try {
      const { getLineAccountQuotaAlerts } = await import("@/lib/line-quota-alerts");
      const alerts = await getLineAccountQuotaAlerts(supabase);
      for (const alert of alerts) {
        // 同日重複の1回制御（webhook_events の (provider, event_id) UNIQUE を業務キーで再利用）
        const claimTs = new Date().toISOString();
        const { error: claimError } = await supabase.from("webhook_events").insert({
          provider: "line",
          event_id: `quota-alert:${todayJst}:${alert.accountKey}:${alert.warnLevel}`,
          event_type: "line_quota_alert",
          status: "processed",
          processing_started_at: claimTs,
          processed_at: claimTs,
          success: true,
        });
        if (claimError) continue; // 23505=本日送信済み / その他=送らない側に倒す

        const { pushToOperatorRecipients } = await import("@/lib/operator-notifications");
        await pushToOperatorRecipients(
          supabase,
          "new_member",
          `⚠️ LINEメッセージ枠が残りわずかです\n\n` +
            `アカウント: ${alert.name}\n` +
            `今月の送信: ${alert.used.toLocaleString("ja-JP")} / ${
              alert.limit === null ? "無制限" : `${alert.limit.toLocaleString("ja-JP")}通`
            }\n` +
            (alert.limit !== null ? `残り: ${alert.remaining?.toLocaleString("ja-JP")}通\n` : "") +
            `このペースの月末見込み: 約${alert.projectedMonthEnd.toLocaleString("ja-JP")}通\n\n` +
            `上限に達すると、このアカウントからの通知・メッセージ送信がすべて止まります。\n` +
            `LINE Official Account Manager で有料プランへの切り替えをご検討ください。\n` +
            `https://manager.line.biz/`
        );
      }
    } catch (err) {
      // 枠チェックの失敗でサマリー本体を止めない
      logger.warn("daily summary: line quota alert failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    // LINE Webhook接続の実測突合。
    // 接続先URLのずれは「会員のメッセージが痕跡なく消える」無音の全損で、
    // 管理画面（/admin/line-accounts）の表示だけでは画面を開かない限り気づけない。
    // 表示と同じ判定（getLineWebhookHealth）を日次で実行し、異常があれば運営へ通知する。
    try {
      // 判定本体は lib/line-webhook-audit.ts（管理画面の表示と同じ基準を共有）
      const { auditLineWebhookEndpoints } = await import("@/lib/line-webhook-audit");
      const problems = await auditLineWebhookEndpoints(supabase);
      for (const p of problems) {
        const claimTs2 = new Date().toISOString();
        const { error: claimError2 } = await supabase.from("webhook_events").insert({
          provider: "line",
          event_id: `webhook-health-alert:${todayJst}:${p.accountKey}:${p.status}`,
          event_type: "line_webhook_health_alert",
          status: "processed",
          processing_started_at: claimTs2,
          processed_at: claimTs2,
          success: true,
        });
        if (claimError2) continue; // 本日通知済み or 障害時は送らない側に倒す

        const { pushToOperatorRecipients } = await import("@/lib/operator-notifications");
        const reason =
          p.status === "mismatch"
            ? `別のURLが設定されています（設定中: ${p.configuredUrl ?? "不明"}）`
            : p.status === "unset"
              ? "Webhook URLが未設定です"
              : "Webhookの利用がオフになっています";
        await pushToOperatorRecipients(
          supabase,
          "new_member",
          `🚨 LINE Webhookの接続に問題があります\n\n` +
            `アカウント: ${p.name}\n` +
            `状態: ${reason}\n\n` +
            `このままでは、このアカウント宛の会員メッセージがシステムに届かず、\n` +
            `どこにも記録されずに消えます。\n` +
            `管理画面「LINE公式アカウント」の\n` +
            `「Webhook接続の状態」からワンタップで修正できます。`
        );
      }
    } catch (err) {
      logger.warn("daily summary: webhook health alert failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }

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
