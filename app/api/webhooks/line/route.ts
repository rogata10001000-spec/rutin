import {
  pushTextMessage,
  verifyLineSignature,
  parsePostbackData,
  toCheckinStatus,
} from "@/lib/line";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { withWebhookIdempotency } from "@/lib/webhook";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit, requestKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { generateUserToken } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { getLineWelcomeTrialMessage, getTrialPeriodDays } from "@/lib/trial";
import { notifyStaffOfInboundMessage } from "@/lib/push-notifications";
import {
  ensureIncompleteEndUser,
  sendLineUncontractedOnboarding,
} from "@/lib/line-onboarding";

type LineFollowEvent = {
  type: "follow";
  timestamp: number;
  source: { userId: string };
  replyToken: string;
  webhookEventId: string;
};

type LineMessageEvent = {
  type: "message";
  timestamp: number;
  source: { userId: string };
  message: { id: string; type: "text"; text: string };
  replyToken: string;
  webhookEventId: string;
};

type LinePostbackEvent = {
  type: "postback";
  timestamp: number;
  source: { userId: string };
  postback: { data: string };
  replyToken: string;
  webhookEventId: string;
};

type LineWebhookEvent = LineFollowEvent | LineMessageEvent | LinePostbackEvent;

type LineWebhookPayload = {
  events: LineWebhookEvent[];
};

function buildSubscribeUrl(lineUserId: string) {
  const token = generateUserToken(lineUserId);
  return `${getServerEnv().APP_BASE_URL}/subscribe/cast?token=${encodeURIComponent(token)}`;
}

function buildWelcomeMessage(lineUserId: string) {
  return getLineWelcomeTrialMessage(getTrialPeriodDays(), buildSubscribeUrl(lineUserId));
}

const DEFAULT_PLAN_CODE = getServerEnv().TRIAL_PLAN_CODE;

async function saveInboundMessage(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  endUserId: string,
  messageId: string,
  messageText: string,
  userStatus: string
): Promise<{ messageId: string | null; duplicate: boolean }> {
  const { data: savedMsg, error: msgError } = await supabase
    .from("messages")
    .insert({
      end_user_id: endUserId,
      direction: "in",
      body: messageText,
      line_message_id: messageId,
    })
    .select("id")
    .single();

  if (msgError) {
    if (msgError.code === "23505") {
      return { messageId: null, duplicate: true };
    }
    throw new Error(`Failed to save message: ${msgError.message}`);
  }

  await writeAuditLog({
    action: "LINE_MESSAGE_SAVED",
    targetType: "messages",
    targetId: savedMsg.id,
    success: true,
    metadata: { end_user_id: endUserId, status: userStatus },
    actorStaffId: null,
  });

  return { messageId: savedMsg.id, duplicate: false };
}

export async function POST(request: Request) {
  const allowed = checkRateLimit({
    key: requestKey(request, "line_webhook"),
    windowMs: 60_000,
    maxRequests: 120,
  });
  if (!allowed) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(signature, body)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body) as LineWebhookPayload;
  const supabase = createAdminSupabaseClient();

  for (const event of payload.events ?? []) {
    const lineUserId = event.source.userId;
    const eventId = event.webhookEventId;

    if (event.type === "follow") {
      const result = await withWebhookIdempotency("line", eventId, "follow", async () => {
        const { id: userId, isNew } = await ensureIncompleteEndUser(
          supabase,
          lineUserId,
          DEFAULT_PLAN_CODE
        );

        if (isNew) {
          await writeAuditLog({
            action: "LINE_FOLLOW",
            targetType: "end_users",
            targetId: userId,
            success: true,
            metadata: { line_user_id: lineUserId },
            actorStaffId: null,
          });
        }

        await sendLineUncontractedOnboarding(lineUserId, buildWelcomeMessage(lineUserId));

        return { success: true, userId, isNew };
      });

      if (result.status === "error") {
        logger.error("LINE webhook follow error", { message: result.message, eventId });
      }
    }

    if (event.type === "message" && event.message.type === "text") {
      const messageId = event.message.id;
      const messageText = event.message.text;

      const result = await withWebhookIdempotency("line", eventId, "message", async () => {
        const { data: user } = await supabase
          .from("end_users")
          .select("id, status")
          .eq("line_user_id", lineUserId)
          .maybeSingle();

        if (!user) {
          const { id: newUserId, isNew } = await ensureIncompleteEndUser(
            supabase,
            lineUserId,
            DEFAULT_PLAN_CODE
          );

          if (isNew) {
            await sendLineUncontractedOnboarding(lineUserId, buildWelcomeMessage(lineUserId));
          }

          const saved = await saveInboundMessage(
            supabase,
            newUserId,
            messageId,
            messageText,
            "incomplete"
          );

          return {
            userId: newUserId,
            messageId: saved.messageId,
            duplicate: saved.duplicate,
            isNew: true,
          };
        }

        const saved = await saveInboundMessage(
          supabase,
          user.id,
          messageId,
          messageText,
          user.status
        );

        return {
          userId: user.id,
          messageId: saved.messageId,
          duplicate: saved.duplicate,
        };
      });

      if (result.status === "error") {
        logger.error("LINE webhook message error", { message: result.message, eventId });
      }

      if (result.status === "processed") {
        const isDuplicate = "duplicate" in result.data && result.data.duplicate;
        const messageIdForPush = "messageId" in result.data ? result.data.messageId : null;

        if (!isDuplicate && messageIdForPush) {
          await notifyStaffOfInboundMessage({
            endUserId: result.data.userId,
            messageId: messageIdForPush,
            body: messageText,
          });
        }
      }
    }

    if (event.type === "postback") {
      const postbackData = parsePostbackData(event.postback.data);

      if (postbackData.action === "checkin") {
        const result = await withWebhookIdempotency("line", eventId, "postback_checkin", async () => {
          const checkinStatus = toCheckinStatus(postbackData.status);
          if (!checkinStatus) {
            logger.warn("LINE checkin: invalid status", {
              status: postbackData.status,
              lineUserId,
            });
            return { skipped: true, reason: "invalid checkin status" };
          }

          const date =
            postbackData.date ||
            new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

          const { data: user } = await supabase
            .from("end_users")
            .select("id")
            .eq("line_user_id", lineUserId)
            .maybeSingle();

          if (!user) {
            logger.warn("LINE checkin: user not found", { lineUserId });
            return { skipped: true, reason: "user not found for checkin" };
          }

          const { data: checkin, error } = await supabase
            .from("checkins")
            .upsert(
              {
                end_user_id: user.id,
                date,
                status: checkinStatus,
              },
              { onConflict: "end_user_id,date" }
            )
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to save checkin: ${error.message}`);
          }

          await writeAuditLog({
            action: "CHECKIN_RECORDED",
            targetType: "checkins",
            targetId: checkin.id,
            success: true,
            metadata: {
              end_user_id: user.id,
              date,
              status: checkinStatus,
            },
            actorStaffId: null,
          });

          return { checkinId: checkin.id };
        });

        if (result.status === "error") {
          logger.error("LINE webhook checkin error", { message: result.message, eventId });
        }
      }
    }
  }

  return Response.json({ ok: true });
}
