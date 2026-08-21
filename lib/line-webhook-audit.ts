import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * LINE Developers 側のWebhook設定と、このシステムの期待URLの実測突合。
 *
 * 接続先URLのずれは「会員のメッセージが痕跡なく消える」無音の全損
 * （宛先違い＝署名不一致で401破棄。ログにもDBにも残らない）。
 * 判定は管理画面の表示（getLineWebhookHealth）と日次cronの運営通知の両方から
 * 使われる。**基準をここ1箇所に集約**し、「画面は赤いのに通知が来ない」型の
 * ズレを構造的に防ぐ。
 */

export type LineWebhookAuditStatus = "ok" | "mismatch" | "inactive" | "unset" | "unreachable";

export type LineWebhookAuditItem = {
  accountKey: string;
  name: string;
  expectedUrl: string;
  status: LineWebhookAuditStatus;
  configuredUrl: string | null;
};

/** アカウントごとの正しいWebhook URL（LINE Developers に設定すべき値） */
export function buildLineWebhookUrl(accountId: string): string {
  const base = getServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/line/${accountId}`;
}

/** 全アクティブアカウントのWebhook設定を実測して返す */
export async function auditAllLineWebhookEndpoints(
  supabase: SupabaseAdmin
): Promise<LineWebhookAuditItem[]> {
  const { getLineAccountById } = await import("@/lib/line-accounts");

  const { data: accounts } = await supabase
    .from("line_official_accounts")
    .select("id, name")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");

  return Promise.all(
    (accounts ?? []).map(async (row): Promise<LineWebhookAuditItem> => {
      const expectedUrl = buildLineWebhookUrl(row.id);
      const base = { accountKey: row.id, name: row.name, expectedUrl };

      const resolved = await getLineAccountById(row.id, supabase);
      if (!resolved) {
        return { ...base, status: "unreachable", configuredUrl: null };
      }

      try {
        const res = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
          headers: { Authorization: `Bearer ${resolved.credentials.accessToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 404) {
          // 未設定のチャネルは 404 が返る
          return { ...base, status: "unset", configuredUrl: null };
        }
        if (!res.ok) {
          return { ...base, status: "unreachable", configuredUrl: null };
        }
        const body = (await res.json()) as { endpoint?: string; active?: boolean };
        if (!body.endpoint) {
          return { ...base, status: "unset", configuredUrl: null };
        }
        if (body.endpoint !== expectedUrl) {
          return { ...base, status: "mismatch", configuredUrl: body.endpoint };
        }
        if (!body.active) {
          return { ...base, status: "inactive", configuredUrl: body.endpoint };
        }
        return { ...base, status: "ok", configuredUrl: body.endpoint };
      } catch {
        return { ...base, status: "unreachable", configuredUrl: null };
      }
    })
  );
}

/**
 * 運営通知の対象となる「確定した接続異常」だけを返す。
 *
 * unreachable（LINE APIから設定を取得できない）は一時障害・トークン不備の可能性が
 * あり日次通知するとノイズになるため、通知対象外（管理画面の表示のみ）とする。
 * mismatch / unset / inactive は「会員のメッセージが確実に届かない」確定状態なので通知する。
 */
export async function auditLineWebhookEndpoints(
  supabase: SupabaseAdmin
): Promise<LineWebhookAuditItem[]> {
  try {
    const items = await auditAllLineWebhookEndpoints(supabase);
    return items.filter(
      (i) => i.status === "mismatch" || i.status === "unset" || i.status === "inactive"
    );
  } catch (err) {
    logger.warn("line webhook audit failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return [];
  }
}
