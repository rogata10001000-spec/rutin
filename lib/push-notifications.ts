import "server-only";

import webPush from "web-push";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
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

export async function notifyAssignedCastOfInboundMessage(params: {
  endUserId: string;
  messageId: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data: user, error } = await supabase
    .from("end_users")
    .select("assigned_cast_id")
    .eq("id", params.endUserId)
    .single();

  if (error) {
    logger.warn("Failed to resolve assigned cast for push notification", {
      endUserId: params.endUserId,
      error: error.message,
    });
    return;
  }

  if (!user?.assigned_cast_id) {
    return;
  }

  const result = await sendPushToStaff(user.assigned_cast_id, {
    title: "新着メッセージ",
    body: "新着メッセージがあります",
    url: `/chat/${params.endUserId}`,
    tag: `message-${params.endUserId}`,
  });

  logger.info("Inbound message push notification attempted", {
    endUserId: params.endUserId,
    messageId: params.messageId,
    staffId: user.assigned_cast_id,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  });
}
