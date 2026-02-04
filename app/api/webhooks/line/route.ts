import {
  pushTextMessage,
  switchRichMenu,
  verifyLineSignature,
  parsePostbackData,
  toCheckinStatus,
} from "@/lib/line";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { withWebhookIdempotency } from "@/lib/webhook";
import { writeAuditLog } from "@/lib/audit";

// LINE Webhook Event Types
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

const WELCOME_MESSAGE = `Rutinへようこそ！

リッチメニューの「プラン契約」からキャストを選んで、7日間の無料トライアルを始めましょう。`;

const DEFAULT_PLAN_CODE = process.env.TRIAL_PLAN_CODE ?? "standard";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  // 署名検証
  if (!verifyLineSignature(signature, body)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(body) as LineWebhookPayload;
  const supabase = createAdminSupabaseClient();

  for (const event of payload.events ?? []) {
    const lineUserId = event.source.userId;
    const eventId = event.webhookEventId;

    // =====================================================
    // フォローイベント（友達追加）
    // =====================================================
    if (event.type === "follow") {
      const result = await withWebhookIdempotency("line", eventId, "follow", async () => {
        // end_user作成（status=incomplete）
        const { data: existingUser } = await supabase
          .from("end_users")
          .select("id")
          .eq("line_user_id", lineUserId)
          .single();

        if (!existingUser) {
          const { data: newUser, error } = await supabase
            .from("end_users")
            .insert({
              line_user_id: lineUserId,
              nickname: `ユーザー_${lineUserId.slice(-6)}`,
              status: "incomplete",
              plan_code: DEFAULT_PLAN_CODE,
            })
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to create end_user: ${error.message}`);
          }

          // 監査ログ
          await writeAuditLog({
            action: "LINE_FOLLOW",
            targetType: "end_users",
            targetId: newUser.id,
            success: true,
            metadata: { line_user_id: lineUserId },
            actorStaffId: null, // システム操作
          });
        }

        // 歓迎メッセージ送信（例外的に自動送信OK）
        await pushTextMessage(lineUserId, WELCOME_MESSAGE);

        // 未契約者用リッチメニュー設定
        const richMenuId = process.env.RICH_MENU_ID_UNCONTRACTED;
        if (richMenuId) {
          await switchRichMenu(lineUserId, richMenuId);
        }

        return { success: true };
      });

      if (result.status === "error") {
        console.error("[LINE Webhook] Follow error:", result.message);
      }
    }

    // =====================================================
    // メッセージイベント（テキスト）
    // =====================================================
    if (event.type === "message" && event.message.type === "text") {
      const messageId = event.message.id;
      const messageText = event.message.text;

      const result = await withWebhookIdempotency("line", eventId, "message", async () => {
        // end_user取得
        const { data: user } = await supabase
          .from("end_users")
          .select("id, status")
          .eq("line_user_id", lineUserId)
          .single();

        if (!user) {
          // ユーザーが存在しない場合は作成
          const { data: newUser, error } = await supabase
            .from("end_users")
            .insert({
              line_user_id: lineUserId,
              nickname: `ユーザー_${lineUserId.slice(-6)}`,
              status: "incomplete",
              plan_code: DEFAULT_PLAN_CODE,
            })
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to create end_user: ${error.message}`);
          }

          // messages(in) insert
          const { error: msgError } = await supabase.from("messages").insert({
            end_user_id: newUser.id,
            direction: "in",
            body: messageText,
            line_message_id: messageId,
          });

          if (msgError) {
            throw new Error(`Failed to save message: ${msgError.message}`);
          }

          // 監査ログ
          await writeAuditLog({
            action: "LINE_MESSAGE_SAVED",
            targetType: "messages",
            targetId: messageId,
            success: true,
            metadata: { end_user_id: newUser.id, status: "incomplete" },
            actorStaffId: null,
          });

          return { userId: newUser.id, isNew: true };
        }

        // messages(in) insert
        const { data: savedMsg, error: msgError } = await supabase
          .from("messages")
          .insert({
            end_user_id: user.id,
            direction: "in",
            body: messageText,
            line_message_id: messageId,
          })
          .select("id")
          .single();

        if (msgError) {
          // 重複は無視（冪等）
          if (msgError.code !== "23505") {
            throw new Error(`Failed to save message: ${msgError.message}`);
          }
          return { userId: user.id, duplicate: true };
        }

        // 監査ログ
        await writeAuditLog({
          action: "LINE_MESSAGE_SAVED",
          targetType: "messages",
          targetId: savedMsg.id,
          success: true,
          metadata: { end_user_id: user.id, status: user.status },
          actorStaffId: null,
        });

        return { userId: user.id };
      });

      if (result.status === "error") {
        console.error("[LINE Webhook] Message error:", result.message);
      }
    }

    // =====================================================
    // ポストバックイベント（チェックイン）
    // =====================================================
    if (event.type === "postback") {
      const postbackData = parsePostbackData(event.postback.data);

      if (postbackData.action === "checkin") {
        const result = await withWebhookIdempotency("line", eventId, "postback_checkin", async () => {
          const checkinStatus = toCheckinStatus(postbackData.status);
          if (!checkinStatus) {
            throw new Error(`Invalid checkin status: ${postbackData.status}`);
          }

          // JSTで今日の日付（postbackにdateがなければ補完）
          const date = postbackData.date || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

          // end_user取得
          const { data: user } = await supabase
            .from("end_users")
            .select("id")
            .eq("line_user_id", lineUserId)
            .single();

          if (!user) {
            throw new Error("User not found for checkin");
          }

          // checkins upsert（同日は上書き）
          const { data: checkin, error } = await supabase
            .from("checkins")
            .upsert(
              {
                end_user_id: user.id,
                date,
                status: checkinStatus,
              },
              {
                onConflict: "end_user_id,date",
              }
            )
            .select("id")
            .single();

          if (error) {
            throw new Error(`Failed to save checkin: ${error.message}`);
          }

          // 監査ログ
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

          // Bot感ゼロ: 自動返信なし

          return { checkinId: checkin.id };
        });

        if (result.status === "error") {
          console.error("[LINE Webhook] Checkin error:", result.message);
        }
      }
    }
  }

  return Response.json({ ok: true });
}
