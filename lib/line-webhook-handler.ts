import "server-only";

import {
  pushTextMessage,
  sendSubscribeGuideFlexMessage,
  replySubscribeGuideFlexMessage,
  switchRichMenu,
  verifyLineSignature,
  parsePostbackData,
  toCheckinStatus,
  getLineMessageContent,
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
import {
  notifyStaffOfInboundMessage,
  notifyManagersOfFollowSurge,
} from "@/lib/push-notifications";
import { applyAcquisitionToEndUser } from "@/lib/acquisition";
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

type LineInboundMessage =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image" | "video" | "audio" | "file" | "sticker" | "location" };

type LineMessageEvent = {
  type: "message";
  timestamp: number;
  source: { userId: string };
  message: LineInboundMessage;
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

// 未契約（incomplete / canceled）ユーザーへ案内を再送するまでの最短間隔。
// 同一ユーザーへ短時間に案内Flexを連投しない（連投はAPI濫用にもUX悪化にもなる）。
const GUIDE_THROTTLE_MS = 30 * 60 * 1000;

// 友だち追加の急増（拡散・荒らし）検知のパラメータ。
// 直近 WINDOW 内に同一アカウントで THRESHOLD 件以上の follow があればアラート。
// 同一アカウントのアラートは COOLDOWN 内に1回までに抑える（通知連投の防止）。
const FOLLOW_SURGE_WINDOW_MS = 10 * 60 * 1000;
const FOLLOW_SURGE_THRESHOLD = 20;
const FOLLOW_SURGE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

// 同一 line_user_id からの受信メッセージの上限（自動ソフトブロック）。
// 契約者・トライアルを含め、人間の会話速度を大きく超える連投を一時的に drop する。
// Dの手動ブロックの自動版。閾値は人間の通常会話より十分高く設定。
const INBOUND_MSG_RATE_WINDOW_MS = 60 * 1000;
const INBOUND_MSG_RATE_MAX = 30;

/** 未契約（サービス未提供）状態か。null/未知の状態も未契約扱いにする。 */
function isUncontractedStatus(status: string | null | undefined): boolean {
  return !status || (CONTRACTED_STATUSES_EXCLUDED as readonly string[]).includes(status);
}

/**
 * 未契約ユーザーの受信に対し、契約案内（メイト選択Flex）を返信する。
 * - reply API を使うため無料枠を消費しない。
 * - 直近 GUIDE_THROTTLE_MS 以内に案内済みなら黙る（連投防止）。
 * - 送信できたら last_guide_sent_at を更新する。
 */
async function replyUncontractedGuide(
  supabase: SupabaseAdmin,
  account: ResolvedLineAccount,
  endUserId: string,
  lineUserId: string,
  replyToken: string,
  lastGuideSentAt: string | null
): Promise<void> {
  if (
    lastGuideSentAt &&
    Date.now() - new Date(lastGuideSentAt).getTime() < GUIDE_THROTTLE_MS
  ) {
    return;
  }

  try {
    await replySubscribeGuideFlexMessage(
      account.credentials,
      replyToken,
      buildSubscribeUrl(lineUserId),
      getTrialPeriodDays()
    );
    await supabase
      .from("end_users")
      .update({ last_guide_sent_at: new Date().toISOString() })
      .eq("id", endUserId);
  } catch (err) {
    logger.warn("LINE uncontracted guide reply failed", {
      lineUserId,
      endUserId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * 友だち追加の急増を検知し、閾値超過なら admin / supervisor へ通知する。
 * follow ライフサイクルイベント（再追加も含む全 follow）を直近ウィンドウで集計する。
 * 検知失敗は follow 処理本体に影響させない（自前で握りつぶす）。
 */
async function checkFollowSurge(
  supabase: SupabaseAdmin,
  account: ResolvedLineAccount
): Promise<void> {
  try {
    const windowStart = new Date(Date.now() - FOLLOW_SURGE_WINDOW_MS).toISOString();
    const windowMinutes = FOLLOW_SURGE_WINDOW_MS / 60000;

    // アカウント単位で集計（メイト個別= cast_id、共通= cast_id is null）。
    let countQuery = supabase
      .from("subscription_lifecycle_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "line_follow")
      .gte("occurred_at", windowStart);
    countQuery = account.castId
      ? countQuery.eq("cast_id", account.castId)
      : countQuery.is("cast_id", null);

    const { count, error } = await countQuery;
    if (error || count === null || count < FOLLOW_SURGE_THRESHOLD) {
      return;
    }

    // 同一アカウントのアラート連投を防ぐ（監査ログを連投抑制の記録に兼用）。
    const targetId = account.id ?? "default";
    const cooldownStart = new Date(Date.now() - FOLLOW_SURGE_ALERT_COOLDOWN_MS).toISOString();
    const { data: recentAlert } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("action", "FOLLOW_SURGE_ALERT")
      .eq("target_id", targetId)
      .gte("created_at", cooldownStart)
      .limit(1)
      .maybeSingle();
    if (recentAlert) {
      return;
    }

    await notifyManagersOfFollowSurge({
      accountName: account.name,
      count,
      windowMinutes,
    });

    await writeAuditLog({
      action: "FOLLOW_SURGE_ALERT",
      targetType: "line_official_accounts",
      targetId,
      success: true,
      metadata: {
        account_id: account.id,
        account_name: account.name,
        follow_count: count,
        window_minutes: windowMinutes,
      },
      actorStaffId: null,
    });

    logger.warn("LINE follow surge detected", {
      accountId: account.id,
      accountName: account.name,
      count,
      windowMinutes,
    });
  } catch (err) {
    logger.warn("LINE follow surge check failed", {
      accountId: account.id,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

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

type InboundContent = {
  body: string;
  messageType: string;
  mediaUrl: string | null;
};

// 非テキストメッセージの本文プレースホルダ（一覧・通知で「何が来たか」を示す）。
const NON_TEXT_BODY: Record<string, string> = {
  image: "[画像]",
  video: "[動画]",
  audio: "[音声]",
  file: "[ファイル]",
  sticker: "[スタンプ]",
  location: "[位置情報]",
};

/**
 * 受信メッセージを保存可能な形（本文・種別・メディアURL）に解決する。
 * 画像は LINE からバイナリを取得し、chat-media バケットへ保存して公開URLを得る。
 * 取得・保存に失敗してもメッセージ自体は「[画像]」として残す（取りこぼし防止）。
 */
async function resolveInboundContent(
  supabase: SupabaseAdmin,
  account: ResolvedLineAccount,
  endUserId: string,
  message: LineInboundMessage
): Promise<InboundContent> {
  if (message.type === "text") {
    return { body: message.text, messageType: "text", mediaUrl: null };
  }

  if (message.type === "image") {
    try {
      const { data, contentType } = await getLineMessageContent(account.credentials, message.id);
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("gif")
          ? "gif"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";
      const path = `${endUserId}/${message.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, data, { contentType, upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // 公開URLではなくストレージ内パスを保存する。バケットは非公開で、
      // 配信は /api/chat-media が認証・担当チェック後に署名付きURLで行う。
      return { body: "[画像]", messageType: "image", mediaUrl: path };
    } catch (err) {
      logger.error("LINE image content fetch/upload failed", {
        messageId: message.id,
        error: err instanceof Error ? err.message : "unknown",
      });
      return { body: "[画像]", messageType: "image", mediaUrl: null };
    }
  }

  return {
    body: NON_TEXT_BODY[message.type] ?? "[メッセージ]",
    messageType: message.type,
    mediaUrl: null,
  };
}

async function saveInboundMessage(
  supabase: SupabaseAdmin,
  endUserId: string,
  messageId: string,
  content: InboundContent,
  userStatus: string,
  lineAccountId: string | null
): Promise<{ messageId: string | null; duplicate: boolean }> {
  const { data: savedMsg, error: msgError } = await supabase
    .from("messages")
    .insert({
      end_user_id: endUserId,
      direction: "in",
      body: content.body,
      message_type: content.messageType,
      media_url: content.mediaUrl,
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

    // ブロック済みユーザーは一切処理しない（保存・通知・案内・プロフィール同期すべてしない）。
    // 拡散されたメイトLINEを荒らす相手を運用側で完全に遮断するための関門。
    const { data: blockState } = await supabase
      .from("end_users")
      .select("is_blocked")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (blockState?.is_blocked) {
      continue;
    }

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

        // 追加直後の件数で急増（拡散・荒らし）を検知して管理者へ通知する。
        await checkFollowSurge(supabase, account);

        // LIFF入口で捕捉済みの流入元があれば first-touch で確定する。
        await applyAcquisitionToEndUser(supabase, lineUserId, user.id);

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
          .select("status, last_guide_sent_at")
          .eq("id", user.id)
          .maybeSingle();
        const status = statusRow?.status ?? "incomplete";
        const isContracted = !["incomplete", "canceled"].includes(status);

        if (isContracted) {
          await applyDefaultContractedRichMenu(account, lineUserId);
        } else {
          // welcome push は連投しない（再追加のたびに無料枠を消費しない）。
          // 直近に案内済みなら welcome を送らず、未送信なら送って last_guide_sent_at を更新。
          const lastGuide = statusRow?.last_guide_sent_at ?? null;
          const recentlyGuided =
            lastGuide && Date.now() - new Date(lastGuide).getTime() < GUIDE_THROTTLE_MS;

          if (!recentlyGuided) {
            await sendLineUncontractedOnboarding(
              account,
              lineUserId,
              buildWelcomeMessage(lineUserId)
            );
            await supabase
              .from("end_users")
              .update({ last_guide_sent_at: new Date().toISOString() })
              .eq("id", user.id);
          }
        }

        return { success: true, userId: user.id, isNew: user.isNew };
      });

      if (result.status === "error") {
        logger.error("LINE webhook follow error", { message: result.message, eventId });
      }
    }

    if (event.type === "message") {
      const inboundMessage = event.message;
      const messageId = inboundMessage.id;

      // 自動ソフトブロック: 同一ユーザーからの受信が短時間に上限を超えたら drop。
      // 契約者・トライアルを含む大量送信（ストレージ/通知の濫用）を止める。
      const withinInboundLimit = await checkRateLimit({
        key: `line_inbound:${lineUserId}`,
        windowMs: INBOUND_MSG_RATE_WINDOW_MS,
        maxRequests: INBOUND_MSG_RATE_MAX,
      });
      if (!withinInboundLimit) {
        logger.warn("LINE inbound message rate limit exceeded; dropping", { lineUserId });
        continue;
      }

      // リッチメニュー「メイトを選ぶ」等のテキスト送信ボタンはコマンドとして処理する。
      // 会話としては保存・スタッフ通知せず、契約状態に応じた案内を返す（未契約はFlexカードでURLを隠す）。
      if (
        inboundMessage.type === "text" &&
        MENU_SELECT_MATE_TEXTS.has(inboundMessage.text.trim())
      ) {
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
        const { data: existing } = await supabase
          .from("end_users")
          .select("id, status, nickname, line_profile_synced_at, last_guide_sent_at")
          .eq("line_user_id", lineUserId)
          .maybeSingle();

        // ユーザー行の解決（無ければ作成）。follow を取りこぼした初回メッセージでも
        // ファネル計上と案内のために行は用意する。会話自体の保存は契約状態で判断する。
        let userId: string;
        let status: string;
        let lastGuideSentAt: string | null;
        let isNew = false;

        if (existing) {
          userId = existing.id;
          status = existing.status;
          lastGuideSentAt = existing.last_guide_sent_at;

          await syncLineProfileToEndUser(supabase, account, {
            endUserId: existing.id,
            lineUserId,
            nickname: existing.nickname,
            lastSyncedAt: existing.line_profile_synced_at,
          });
        } else {
          const createdUser = await ensureIncompleteEndUser(supabase, lineUserId, DEFAULT_PLAN_CODE);
          userId = createdUser.id;
          status = "incomplete";
          lastGuideSentAt = null;
          isNew = createdUser.isNew;

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
        }

        await markPrimaryAccountIfMate(supabase, account, userId);

        // 未契約（incomplete / canceled）ユーザーの連絡は受け付けない。
        // 保存・画像取得・スタッフ通知を行わず、契約への案内のみ返す（＝管理画面にも出ない）。
        if (isUncontractedStatus(status)) {
          if (isNew) {
            // 初回接触は welcome + リッチメニューで迎える（follow 取りこぼしの保険）。
            await sendLineUncontractedOnboarding(
              account,
              lineUserId,
              buildWelcomeMessage(lineUserId)
            );
            await supabase
              .from("end_users")
              .update({ last_guide_sent_at: new Date().toISOString() })
              .eq("id", userId);
          } else {
            await replyUncontractedGuide(
              supabase,
              account,
              userId,
              lineUserId,
              event.replyToken,
              lastGuideSentAt
            );
          }

          return { uncontracted: true, userId };
        }

        // 契約者（trial / active / past_due / paused）は従来どおり受信・保存する。
        const content = await resolveInboundContent(supabase, account, userId, inboundMessage);
        const saved = await saveInboundMessage(
          supabase,
          userId,
          messageId,
          content,
          status,
          lineAccountId
        );

        return {
          uncontracted: false,
          userId,
          messageId: saved.messageId,
          duplicate: saved.duplicate,
          body: content.body,
        };
      });

      if (result.status === "error") {
        logger.error("LINE webhook message error", { message: result.message, eventId });
      }

      // 通知は契約者の保存メッセージに対してのみ送る（未契約者では一切通知しない）。
      if (result.status === "processed" && !result.data.uncontracted) {
        const isDuplicate = "duplicate" in result.data && result.data.duplicate;
        const messageIdForPush = "messageId" in result.data ? result.data.messageId : null;

        if (!isDuplicate && messageIdForPush) {
          await notifyStaffOfInboundMessage({
            endUserId: result.data.userId,
            messageId: messageIdForPush,
            body: "body" in result.data ? result.data.body : "",
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
