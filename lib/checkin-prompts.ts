import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getDefaultLineAccount, getLineAccountById } from "@/lib/line-accounts";
import { sendCheckinFlexMessage } from "@/lib/line";
import { logger } from "@/lib/logger";
import { selectCheckinPromptTargets } from "@/lib/checkin-prompt-targets";

/**
 * 朝のチェックイン催促（毎日 9:00 JST の cron から呼ばれる）。
 *
 * - 対象: daily_checkin_enabled のプランで契約中（trial/active/past_due）、ブロックされていない人。
 *   今日すでにチェックイン済みの人には送らない。
 * - 多重発火対策: webhook_events の (provider, event_id) UNIQUE を
 *   `checkin-prompt:{日付}:{end_user_id}` の業務キーで claim-first に使う
 *   （送信→記録の順にすると並行実行で二重送信になる。確保後の送信失敗は「送信漏れ」側に倒す＝
 *   顧客向け通知は二重送信の害のほうが大きい）。
 * - 送信元はその人の会話アカウント（primary_line_account_id）。無ければ共通アカウント。
 */

const SEND_CONCURRENCY = 5;

export type CheckinPromptResult = {
  date: string;
  eligible: number;
  sent: number;
  skippedAlreadyCheckedIn: number;
  skippedClaimed: number;
  failed: number;
};

export async function runDailyCheckinPrompts(now = new Date()): Promise<CheckinPromptResult> {
  const supabase = createAdminSupabaseClient();
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const result: CheckinPromptResult = {
    date: today,
    eligible: 0,
    sent: 0,
    skippedAlreadyCheckedIn: 0,
    skippedClaimed: 0,
    failed: 0,
  };

  const [{ data: plans, error: plansError }, { data: users, error: usersError }] = await Promise.all([
    supabase.from("plans").select("plan_code").eq("daily_checkin_enabled", true).eq("active", true),
    supabase
      .from("end_users")
      .select("id, status, plan_code, line_user_id, primary_line_account_id, is_blocked")
      .in("status", ["trial", "active", "past_due"])
      .eq("is_blocked", false)
      .not("line_user_id", "is", null)
      .limit(5000),
  ]);
  if (plansError) throw new Error(`plans: ${plansError.message}`);
  if (usersError) throw new Error(`end_users: ${usersError.message}`);

  const enabledPlans = new Set((plans ?? []).map((p) => p.plan_code));
  const candidates = users ?? [];
  if (candidates.length === 0) return result;

  const { data: todayCheckins, error: checkinsError } = await supabase
    .from("checkins")
    .select("end_user_id")
    .eq("date", today)
    .in(
      "end_user_id",
      candidates.map((u) => u.id)
    );
  if (checkinsError) throw new Error(`checkins: ${checkinsError.message}`);
  const checkedIn = new Set((todayCheckins ?? []).map((c) => c.end_user_id));

  const targets = selectCheckinPromptTargets(candidates, enabledPlans, checkedIn);
  result.eligible = targets.length;
  result.skippedAlreadyCheckedIn = candidates.filter(
    (u) => enabledPlans.has(u.plan_code) && checkedIn.has(u.id)
  ).length;
  if (targets.length === 0) return result;

  const defaultAccount = await getDefaultLineAccount(supabase);

  const sendOne = async (user: (typeof targets)[number]): Promise<void> => {
    if (!user.line_user_id) return;
    const claimTs = new Date().toISOString();
    const { error: claimError } = await supabase.from("webhook_events").insert({
      provider: "line",
      event_id: `checkin-prompt:${today}:${user.id}`,
      event_type: "checkin_prompt",
      status: "processed",
      processing_started_at: claimTs,
      processed_at: claimTs,
      success: true,
    });
    if (claimError) {
      // 23505=本日送信済み（並行実行・再実行）。その他の障害も「送らない側」に倒す
      result.skippedClaimed += 1;
      return;
    }
    try {
      const account = user.primary_line_account_id
        ? ((await getLineAccountById(user.primary_line_account_id, supabase)) ?? defaultAccount)
        : defaultAccount;
      await sendCheckinFlexMessage(account.credentials, user.line_user_id);
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      logger.warn("checkin prompt send failed", {
        endUserId: user.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  };

  for (let i = 0; i < targets.length; i += SEND_CONCURRENCY) {
    await Promise.all(targets.slice(i, i + SEND_CONCURRENCY).map(sendOne));
  }

  logger.info("daily checkin prompts done", result);
  return result;
}
