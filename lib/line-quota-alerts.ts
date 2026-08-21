import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { assessLineQuota, fetchLineQuotaSnapshot } from "@/lib/line-quota";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export type LineQuotaAlert = {
  accountKey: string;
  name: string;
  warnLevel: "warning" | "critical";
  limit: number | null;
  used: number;
  remaining: number | null;
  projectedMonthEnd: number;
};

/**
 * 全LINE公式アカウントの月間枠を実測し、警告圏（warning/critical）のものを返す。
 *
 * 管理画面の表示（getLineAccountQuotas）と同じ判定基準（assessLineQuota）を使う。
 * 表示と通知で基準がズレると「画面は黄色なのに通知が来ない」型の混乱になるため、
 * 判定は lib/line-quota.ts の1箇所に集約されている。
 */
export async function getLineAccountQuotaAlerts(
  supabase: SupabaseAdmin
): Promise<LineQuotaAlert[]> {
  const { getDefaultLineAccount, getLineAccountById } = await import("@/lib/line-accounts");

  const targets: { accountKey: string; name: string; accessToken: string }[] = [];

  const { data: accounts } = await supabase
    .from("line_official_accounts")
    .select("id, name, is_default")
    .eq("active", true);

  for (const row of accounts ?? []) {
    const resolved = await getLineAccountById(row.id, supabase);
    if (resolved?.credentials.accessToken) {
      targets.push({ accountKey: row.id, name: row.name, accessToken: resolved.credentials.accessToken });
    }
  }

  // envフォールバックの共通アカウント（DBにdefault行が無い運用）も枠を消費する
  if (!(accounts ?? []).some((a) => a.is_default)) {
    try {
      const envDefault = await getDefaultLineAccount(supabase);
      if (envDefault.id === null && envDefault.credentials.accessToken) {
        targets.push({
          accountKey: "env-default",
          name: envDefault.name,
          accessToken: envDefault.credentials.accessToken,
        });
      }
    } catch {
      // env未設定なら共通アカウント無しとして続行
    }
  }

  const alerts: LineQuotaAlert[] = [];
  const now = new Date();

  for (const t of targets) {
    const snapshot = await fetchLineQuotaSnapshot(t.accountKey, { accessToken: t.accessToken });
    if (!snapshot) {
      // 取得失敗は「警告なし」と断定しない（が、通知も出せないのでログのみ）
      logger.warn("line quota alert: snapshot unavailable", { accountKey: t.accountKey });
      continue;
    }
    const a = assessLineQuota({ snapshot, now });
    if (a.warnLevel === "warning" || a.warnLevel === "critical") {
      alerts.push({
        accountKey: t.accountKey,
        name: t.name,
        warnLevel: a.warnLevel,
        limit: a.limit,
        used: a.used,
        remaining: a.remaining,
        projectedMonthEnd: a.projectedMonthEnd,
      });
    }
  }

  return alerts;
}
