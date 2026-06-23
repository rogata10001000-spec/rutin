import "server-only";

import webPush from "web-push";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  resolveInboundMessageNotifyStaffIds,
  truncateMessageBody,
} from "@/lib/push-notification-targets";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

export function getWebPushPublicKey() {
  const env = getServerEnv();
  return env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

export function isWebPushConfigured() {
  const env = getServerEnv();
  return Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY);
}

function ensureWebPushConfigured() {
  const env = getServerEnv();
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return false;
  }

  if (!configured) {
    webPush.setVapidDetails(env.WEB_PUSH_CONTACT ?? env.APP_BASE_URL, publicKey, privateKey);
    configured = true;
  }

  return true;
}

function isExpiredSubscriptionError(error: unknown) {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode?: number }).statusCode)
    : null;

  return statusCode === 404 || statusCode === 410;
}

async function disableSubscription(id: string) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("staff_push_subscriptions")
    .update({ enabled: false })
    .eq("id", id);

  if (error) {
    logger.warn("Failed to disable expired push subscription", { subscriptionId: id, error: error.message });
  }
}

export async function sendPushToStaff(staffId: string, payload: PushPayload) {
  if (!ensureWebPushConfigured()) {
    logger.warn("Web Push VAPID keys are not configured");
    return { sent: 0, failed: 0, skipped: true };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("staff_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("staff_id", staffId)
    .eq("enabled", true);

  if (error) {
    logger.error("Failed to fetch push subscriptions", { staffId, error: error.message });
    return { sent: 0, failed: 0, skipped: false };
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        logger.warn("Failed to send Web Push notification", {
          staffId,
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });

        if (isExpiredSubscriptionError(error)) {
          await disableSubscription(subscription.id);
        }
      }
    })
  );

  return { sent, failed, skipped: false };
}

export async function notifyStaffOfInboundMessage(params: {
  endUserId: string;
  messageId: string;
  body: string;
}) {
  const supabase = createAdminSupabaseClient();

  const [{ data: user, error: userError }, { data: managers, error: managersError }] =
    await Promise.all([
      supabase
        .from("end_users")
        .select("assigned_cast_id, nickname, line_display_name")
        .eq("id", params.endUserId)
        .single(),
      supabase
        .from("staff_profiles")
        .select("id")
        .in("role", ["admin", "supervisor"])
        .eq("active", true),
    ]);

  if (userError) {
    logger.warn("Failed to resolve assigned cast for push notification", {
      endUserId: params.endUserId,
      error: userError.message,
    });
  }

  if (managersError) {
    logger.warn("Failed to resolve manager staff for push notification", {
      endUserId: params.endUserId,
      error: managersError.message,
    });
  }

  const staffIds = resolveInboundMessageNotifyStaffIds({
    assignedCastId: userError ? null : (user?.assigned_cast_id ?? null),
    managerStaffIds: managersError ? [] : (managers ?? []).map((manager) => manager.id),
  });

  if (staffIds.length === 0) {
    return;
  }

  // 通知タイトルに送信ユーザー名を出す。自動生成ニックネームの場合はLINE表示名を優先。
  const nickname = userError ? null : (user?.nickname ?? null);
  const lineDisplayName = userError ? null : (user?.line_display_name ?? null);
  const displayName =
    nickname && !nickname.startsWith("ユーザー_")
      ? nickname
      : lineDisplayName ?? nickname ?? null;
  const title = displayName?.trim() ? `${displayName}さん` : "新着メッセージ";

  const payload: PushPayload = {
    title,
    body: truncateMessageBody(params.body),
    url: `/inbox?user=${params.endUserId}`,
    tag: `message-${params.endUserId}`,
  };

  const results = await Promise.all(staffIds.map((staffId) => sendPushToStaff(staffId, payload)));

  logger.info("Inbound message push notifications attempted", {
    endUserId: params.endUserId,
    messageId: params.messageId,
    staffIds,
    sent: results.reduce((total, result) => total + result.sent, 0),
    failed: results.reduce((total, result) => total + result.failed, 0),
    skipped: results.some((result) => result.skipped),
  });
}

/**
 * 友だち追加の急増（拡散・荒らしの疑い）を admin / supervisor へ通知する。
 */
export async function notifyManagersOfFollowSurge(params: {
  accountName: string;
  count: number;
  windowMinutes: number;
}) {
  const supabase = createAdminSupabaseClient();
  const { data: managers, error } = await supabase
    .from("staff_profiles")
    .select("id")
    .in("role", ["admin", "supervisor"])
    .eq("active", true);

  if (error) {
    logger.warn("Failed to resolve managers for follow surge alert", { error: error.message });
    return;
  }

  const staffIds = (managers ?? []).map((manager) => manager.id);
  if (staffIds.length === 0) {
    return;
  }

  const payload: PushPayload = {
    title: "⚠️ 友だち追加が急増しています",
    body: `${params.accountName}に${params.windowMinutes}分で${params.count}件の追加。拡散・荒らしの可能性があります。`,
    url: "/users",
    tag: "follow-surge",
  };

  const results = await Promise.all(staffIds.map((staffId) => sendPushToStaff(staffId, payload)));

  logger.info("Follow surge alert push attempted", {
    accountName: params.accountName,
    count: params.count,
    staffIds,
    sent: results.reduce((total, result) => total + result.sent, 0),
    failed: results.reduce((total, result) => total + result.failed, 0),
  });
}

/** @deprecated Use notifyStaffOfInboundMessage instead */
export async function notifyAssignedCastOfInboundMessage(params: {
  endUserId: string;
  messageId: string;
}) {
  await notifyStaffOfInboundMessage({
    endUserId: params.endUserId,
    messageId: params.messageId,
    body: "新着メッセージがあります",
  });
}
