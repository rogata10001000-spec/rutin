"use server";

import { requireAdmin, generateUserToken } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { getTrialPeriodDays } from "@/lib/trial";
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import { renderFunnelCopy } from "@/lib/funnel-copy-defs";
import { buildSubscribeGuideFlex, type SubscribeGuideFlexCopy } from "@/lib/line";
import { getSendAccountForEndUser } from "@/lib/line-accounts";
import { logger } from "@/lib/logger";
import type { Result } from "../types";

/**
 * 申込ファネルLINE文言のテスト送信（Admin）。
 *
 * 下書き優先（draft ?? published ?? デフォルト）の文言を、実際のトライアル日数・
 * 実際の申込URL（本番の welcome フローと同じトークン付きURL）でレンダリングし、
 * 運営の通知先LINE（新規会員通知と同じ宛先）へ welcome テキストと申込案内Flexカードの
 * 両方を送る。管理画面のLINE風モックでは確認できない「実機での見え方」を確かめるための機能。
 */

// LINE API の上限（外部サービス制約は送信シンクで最終クランプする。
// Flex側の altText / button は buildSubscribeGuideFlex 内でクランプされる）
const TEXT_MESSAGE_MAX = 5000;
const PUSH_TIMEOUT_MS = 10_000;

/**
 * welcomeテキストとFlexカードを1回のpushでまとめて送る（タイムアウト付き）。
 * lib/line.ts に複数メッセージの汎用pushが無いため、この管理用途に限りここで送る。
 */
async function pushMessagesWithTimeout(
  accessToken: string,
  to: string,
  messages: unknown[]
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LINE push failed: ${res.status} - ${errorText.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export type SendFunnelLineTestResult = Result<{ sent: number; total: number }>;

/**
 * 下書き優先のLINE文言（welcomeテキスト + 申込案内Flex）を運営の通知先LINEへテスト送信する。
 * 送信URLは受信者本人の line_user_id で発行した本物の申込リンク（本番 welcome と同じ形）。
 */
export async function sendFunnelLineTestMessages(): Promise<SendFunnelLineTestResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();

  const { data: recipients, error } = await supabase
    .from("operator_notification_recipients")
    .select("end_user_id")
    .eq("event_type", "new_member");

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "通知先の取得に失敗しました" } };
  }
  if (!recipients || recipients.length === 0) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "送信先がありません。「通知設定」で運営の通知先LINEを追加してください",
      },
    };
  }

  // 下書き優先で文言を解決（プレビュー = 公開前の内容を実機確認するのが目的）
  const copy = await getFunnelCopyValues(
    [
      "line.welcome.body",
      "line.flex.alttext",
      "line.flex.title",
      "line.flex.body",
      "line.flex.expiry",
      "line.flex.button",
    ],
    { preview: true }
  );
  const days = getTrialPeriodDays();
  const baseUrl = getServerEnv().APP_BASE_URL;

  const flexCopy: SubscribeGuideFlexCopy = {
    altText: renderFunnelCopy(copy["line.flex.alttext"] ?? "", { days }),
    title: renderFunnelCopy(copy["line.flex.title"] ?? "", { days }),
    body: renderFunnelCopy(copy["line.flex.body"] ?? "", { days }),
    expiry: renderFunnelCopy(copy["line.flex.expiry"] ?? "", { days }),
    button: renderFunnelCopy(copy["line.flex.button"] ?? "", { days }),
  };

  let sent = 0;
  for (const r of recipients) {
    try {
      const { data: user } = await supabase
        .from("end_users")
        .select("line_user_id")
        .eq("id", r.end_user_id)
        .maybeSingle();
      if (!user?.line_user_id) continue;

      // 本番の welcome フロー（line-webhook-handler の buildSubscribeUrl）と同じ形のURL
      const token = generateUserToken(user.line_user_id);
      const subscribeUrl = `${baseUrl}/subscribe/cast?token=${encodeURIComponent(token)}`;

      const account = await getSendAccountForEndUser(r.end_user_id, supabase);
      const welcomeText = renderFunnelCopy(copy["line.welcome.body"] ?? "", {
        days,
        subscribeUrl,
      }).slice(0, TEXT_MESSAGE_MAX);

      await pushMessagesWithTimeout(account.credentials.accessToken, user.line_user_id, [
        { type: "text", text: welcomeText },
        buildSubscribeGuideFlex(subscribeUrl, flexCopy),
      ]);
      sent += 1;
    } catch (err) {
      logger.warn("funnelCopy: LINE test send failed for recipient", {
        recipientEndUserId: r.end_user_id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  if (sent === 0) {
    return {
      ok: false,
      error: {
        code: "EXTERNAL_API_ERROR",
        message: "テスト送信できませんでした。通知先のLINE連携状態を確認してください",
      },
    };
  }

  return { ok: true, data: { sent, total: recipients.length } };
}
