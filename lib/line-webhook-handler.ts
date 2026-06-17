import "server-only";

import {
  pushTextMessage,
  sendSubscribeGuideFlexMessage,
  switchRichMenu,
  verifyLineSignature,
  parsePostbackData,
  toCheckinStatus,
} from "@/lib/line";
import type { ResolvedLineAccount } from "@/lib/line-accounts";
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
  syncLineProfileToEndUser,
} from "@/lib/line-onboarding";
import { buildAccountPlanUrl } from "@/lib/subscribe-paths";
import { recordSubscriptionLifecycleEvent } from "@/lib/subscription-lifecycle";

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
  destination?: string;
  events: LineWebhookEvent[];
};

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

const DEFAULT_PLAN_CODE = getServerEnv().TRIAL_PLAN_CODE;
const CONTRACTED_STATUSES_EXCLUDED = ["incomplete", "canceled"] as const;

// リッチメニューのボタンが「テキスト送信」アクションの場合に届く定型文。
// 会話ではなくナビゲーション操作として扱い、生URLを露出せず案内（Flex/管理リンク）で応答する。
const MENU_SELECT_MATE_TEXTS = new Set([
  "メイトを選ぶ",
  "メイトを選んで始める",
  "メイトを見る",
]);

function buildSubscribeUrl(lineUserId: string) {
  const token = generateUserToken(lineUserId);
  return `${getServerEnv().APP_BASE_URL}/subscribe/cast?token=${encodeURIComponent(token)}`;
}

function buildWelcomeMessage(lineUserId: string) {
  return getLineWelcomeTrialMessage(getTrialPeriodDays(), buildSubscribeUrl(lineUserId));
}

async function saveInboundMessage(
  supabase: SupabaseAdmin,
  endUserId: string,
  messageId: string,
  messageText: string,
  userStatus: string,
  lineAccountId: string | null
): Promise<{ messageId: string | null; duplicate: boolean }> {
  const { data: savedMsg, error: msgError } = await supabase
    .from("messages")
    .insert({
      end_user_id: endUserId,
      direction: "in",
      body: messageText,
      line_message_id: messageId,
      line_account_id: lineAccountId,
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
    metadata: { end_user_id: endUserId, status: userStatus, line_account_id: lineAccountId },
    actorStaffId: null,
  });

  return { messageId: savedMsg.id, duplicate: false };
}

/**
 * メイト個別アカウント上でユーザーが反応したとき、会話アカウントを更新する。
 * デフォルト(共通)アカウントでは何もしない。
 * 会話アカウントが実際に変わった場合のみ true を返す（リッチメニュー切替の判定に使う）。
 */
async function markPrimaryAccountIfMate(
  supabase: SupabaseAdmin,
  account: ResolvedLineAccount,
  endUserId: string
): Promise<boolean> {
  if (!account.id || account.isDefault) return false;

  // 現在値を確認（NULL=共通 → メイト への初回遷移も検知する。
  // .neq だけでは NULL 行が SQL 上 NULL<>x=false となり更新されないため明示比較する）
  const { data: current } = await supabase
    .from("end_users")
    .select("primary_line_account_id")
    .eq("id", endUserId)
    .maybeSingle();

  if (current?.primary_line_account_id === account.id) {
    return false;
  }

  await supabase
    .from("end_users")
    .update({ primary_line_account_id: account.id })
    .eq("id", endUserId);

  return true;
}

/**
 * 共通Rutin公式LINE上で、契約済リッチメニューへ切り替える。
 * メイト個別LINEにはリッチメニューを設定しない運用のため、メイトアカウントでは何もしない。
 */
async function applyDefaultContractedRichMenu(
  account: ResolvedLineAccount,
  lineUserId: string
): Promise<void> {
  if (!account.isDefault) return;

  const richMenuId = account.richMenuContractedId;

  if (!richMenuId) return;

  try {
    await switchRichMenu(account.credentials, lineUserId, richMenuId);
  } catch (err) {
    logger.error("LINE default contracted rich menu switch failed", {
      lineUserId,
      accountId: account.id,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * 指定アカウント・指定ユーザーのチャネルシークレットで署名検証し、
 * イベントを処理する共通ハンドラ。
 */
export async function handleLineWebhook(
  request: Request,
  account: ResolvedLineAccount
): Promise<Response> {
  const allowed = await checkRateLimit({
    key: requestKey(request, `line_webhook:${account.id ?? "default"}`),
    windowMs: 60_000,
    maxRequests: 120,
  });
  if (!allowed) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifyLineSignature(account.credentials, signature, body)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body) as LineWebhookPayload;
  if (account.botUserId && payload.destination && payload.destination !== account.botUserId) {
    logger.warn("LINE webhook destination mismatch", {
      accountId: account.id,
      expected: account.botUserId,
      actual: payload.destination,
    });
    return new Response("Destination mismatch", { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const lineAccountId = account.id;

  for (const event of payload.events ?? []) {
    const lineUserId = event.source.userId;
    const eventId = event.webhookEventId;

    if (event.type === "follow") {
      const result = await withWebhookIdempotency("line", eventId, "follow", async () => {
        const user = await ensureIncompleteEndUser(supabase, lineUserId, DEFAULT_PLAN_CODE);
        const followedAt = new Date(event.timestamp).toISOString();

        await supabase
          .from("end_users")
          .update({ line_followed_at: followedAt })
          .eq("id", user.id)
          .is("line_followed_at", null);

        if (user.isNew) {
          await writeAuditLog({
            action: "LINE_FOLLOW",
            targetType: "end_users",
            targetId: user.id,
            success: true,
            metadata: { line_user_id: lineUserId, line_account_id: lineAccountId },
            actorStaffId: null,
          });
        }

        await recordSubscriptionLifecycleEvent(supabase, {
          endUserId: user.id,
          castId: account.castId,
          eventType: "line_follow",
          planCode: DEFAULT_PLAN_CODE,
          occurredAt: followedAt,
          sourceRefType: "line:follow",
          sourceRefId: eventId,
          metadata: {
            line_user_id: lineUserId,
            line_account_id: lineAccountId,
            is_new: user.isNew,
          },
        });

        await syncLineProfileToEndUser(supabase, account, {
          endUserId: user.id,
          lineUserId,
          nickname: user.nickname,
          lastSyncedAt: user.lineProfileSyncedAt,
          force: true,
        });

        await markPrimaryAccountIfMate(supabase, account, user.id);

        // メイト個別LINEにはリッチメニューを設定しない。
        // 契約者が共通LINEを再追加した場合だけ、共通LINE側の契約済メニューを復元する。
        const { data: statusRow } = await supabase
          .from("end_users")
          .select("status")
          .eq("id", user.id)
          .maybeSingle();
        const status = statusRow?.status ?? "incomplete";
        const isContracted = !["incomplete", "canceled"].includes(status);

        if (isContracted) {
          await applyDefaultContractedRichMenu(account, lineUserId);
        } else {
          await sendLineUncontractedOnboarding(
            account,
            lineUserId,
            buildWelcomeMessage(lineUserId)
          );
        }

        return { success: true, userId: user.id, isNew: user.isNew };
      });

      if (result.status === "error") {
        logger.error("LINE webhook follow error", { message: result.message, eventId });
      }
    }

    if (event.type === "message" && event.message.type === "text") {
      const messageId = event.message.id;
      const messageText = event.message.text;

      // リッチメニュー「メイトを選ぶ」等のテキスト送信ボタンはコマンドとして処理する。
      // 会話としては保存・スタッフ通知せず、契約状態に応じた案内を返す（未契約はFlexカードでURLを隠す）。
      if (MENU_SELECT_MATE_TEXTS.has(messageText.trim())) {
        const cmd = await withWebhookIdempotency("line", eventId, "menu_select_mate", async () => {
          const { data: menuUser } = await supabase
            .from("end_users")
            .select("status")
            .eq("line_user_id", lineUserId)
            .maybeSingle();

          const isContracted =
            menuUser && !CONTRACTED_STATUSES_EXCLUDED.includes(menuUser.status as never);

          if (isContracted) {
            await pushTextMessage(
              account.credentials,
              lineUserId,
              `契約内容の確認・プラン変更・解約はこちらから行えます（リンクは30分間有効です）。\n${buildAccountPlanUrl(
                generateUserToken(lineUserId)
              )}`
            );
            return { contracted: true };
          }

          await sendSubscribeGuideFlexMessage(
            account.credentials,
            lineUserId,
            buildSubscribeUrl(lineUserId),
            getTrialPeriodDays()
          );
          return { contracted: false };
        });

        if (cmd.status === "error") {
          logger.error("LINE webhook menu_select_mate error", {
            message: cmd.message,
            eventId,
          });
        }
        continue;
      }

      const result = await withWebhookIdempotency("line", eventId, "message", async () => {
        const { data: user } = await supabase
          .from("end_users")
          .select("id, status, nickname, line_profile_synced_at")
          .eq("line_user_id", lineUserId)
          .maybeSingle();

        if (!user) {
          const createdUser = await ensureIncompleteEndUser(supabase, lineUserId, DEFAULT_PLAN_CODE);
          const firstContactAt = new Date(event.timestamp).toISOString();

          await supabase
            .from("end_users")
            .update({ line_followed_at: firstContactAt })
            .eq("id", createdUser.id)
            .is("line_followed_at", null);

          if (createdUser.isNew) {
            await recordSubscriptionLifecycleEvent(supabase, {
              endUserId: createdUser.id,
              castId: account.castId,
              eventType: "line_follow",
              planCode: DEFAULT_PLAN_CODE,
              occurredAt: firstContactAt,
              sourceRefType: "line:first_message",
              sourceRefId: eventId,
              metadata: {
                line_user_id: lineUserId,
                line_account_id: lineAccountId,
                message_id: messageId,
                inferred_from: "first_message",
              },
            });
          }

          await syncLineProfileToEndUser(supabase, account, {
            endUserId: createdUser.id,
            lineUserId,
            nickname: createdUser.nickname,
            lastSyncedAt: createdUser.lineProfileSyncedAt,
            force: createdUser.isNew,
          });

          await markPrimaryAccountIfMate(supabase, account, createdUser.id);

          if (createdUser.isNew) {
            await sendLineUncontractedOnboarding(
              account,
              lineUserId,
              buildWelcomeMessage(lineUserId)
            );
          }

          const saved = await saveInboundMessage(
            supabase,
            createdUser.id,
            messageId,
            messageText,
            "incomplete",
            lineAccountId
          );

          return {
            userId: createdUser.id,
            messageId: saved.messageId,
            duplicate: saved.duplicate,
            isNew: true,
          };
        }

        await syncLineProfileToEndUser(supabase, account, {
          endUserId: user.id,
          lineUserId,
          nickname: user.nickname,
          lastSyncedAt: user.line_profile_synced_at,
        });

        await markPrimaryAccountIfMate(supabase, account, user.id);

        const saved = await saveInboundMessage(
          supabase,
          user.id,
          messageId,
          messageText,
          user.status,
          lineAccountId
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

      if (postbackData.action === "select_mate") {
        const result = await withWebhookIdempotency(
          "line",
          eventId,
          "postback_select_mate",
          async () => {
            await sendSubscribeGuideFlexMessage(
              account.credentials,
              lineUserId,
              buildSubscribeUrl(lineUserId),
              getTrialPeriodDays()
            );
            return { sent: true };
          }
        );

        if (result.status === "error") {
          logger.error("LINE webhook select_mate error", {
            message: result.message,
            eventId,
          });
        }
      }

      if (postbackData.action === "manage_subscription") {
        const result = await withWebhookIdempotency(
          "line",
          eventId,
          "postback_manage_subscription",
          async () => {
            const { data: user } = await supabase
              .from("end_users")
              .select("id, status")
              .eq("line_user_id", lineUserId)
              .maybeSingle();

            // 契約者以外（未契約・解約済み）は新規契約導線へ案内
            const isContracted =
              user && !CONTRACTED_STATUSES_EXCLUDED.includes(user.status as never);

            if (!isContracted) {
              await sendSubscribeGuideFlexMessage(
                account.credentials,
                lineUserId,
                buildSubscribeUrl(lineUserId),
                getTrialPeriodDays()
              );
              return { contracted: false };
            }

            await pushTextMessage(
              account.credentials,
              lineUserId,
              `契約内容の確認・プラン変更・解約はこちらから行えます（リンクは30分間有効です）。\n${buildAccountPlanUrl(
                generateUserToken(lineUserId)
              )}`
            );
            return { contracted: true };
          }
        );

        if (result.status === "error") {
          logger.error("LINE webhook manage_subscription error", {
            message: result.message,
            eventId,
          });
        }
      }
    }
  }

  return Response.json({ ok: true });
}
