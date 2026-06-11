import crypto from "crypto";
import { fetchWithRetry } from "@/lib/http-client";
import { logger } from "@/lib/logger";

const LINE_API_BASE = "https://api.line.me/v2/bot";

/**
 * LINE送受信に必要な資格情報。
 * lib/line-accounts.ts の resolver が DB/env から解決して渡す。
 */
export type LineAccountCredentials = {
  accessToken: string;
  channelSecret: string;
};

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
};

/**
 * LINE署名検証（指定アカウントのチャネルシークレットで検証）
 */
export const verifyLineSignature = (
  account: Pick<LineAccountCredentials, "channelSecret">,
  signature: string | null,
  body: string
): boolean => {
  if (!account.channelSecret) {
    throw new Error("LINE channel secret is not set");
  }
  if (!signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", account.channelSecret)
    .update(body)
    .digest("base64");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
};

/**
 * LINEにテキストメッセージを送信（指定アカウントのトークンで送信）
 */
export const pushTextMessage = async (
  account: Pick<LineAccountCredentials, "accessToken">,
  lineUserId: string,
  text: string
): Promise<void> => {
  const res = await fetchWithRetry(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error("LINE push failed", { status: res.status, lineUserId });
    throw new Error(`LINE push failed: ${res.status} - ${errorText.slice(0, 200)}`);
  }
};

/**
 * 未契約ユーザー向けに、長いURLを本文へ出さずメイト選択へ案内する。
 */
export const sendSubscribeGuideFlexMessage = async (
  account: Pick<LineAccountCredentials, "accessToken">,
  lineUserId: string,
  subscribeUrl: string,
  trialDays: number
): Promise<void> => {
  const trialLabel = `${trialDays}日間`;
  const flexMessage = {
    type: "flex",
    altText: `メイトを選んで${trialLabel}無料トライアルを始められます`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "メイトを選んで始めましょう",
            weight: "bold",
            size: "lg",
            color: "#2D241E",
            wrap: true,
          },
          {
            type: "text",
            text: `気になる伴走メイトを選んで、まずは${trialLabel}無料でRutinをお試しいただけます。`,
            size: "sm",
            color: "#6B5A51",
            wrap: true,
          },
          {
            type: "text",
            text: "ボタンの有効期限は30分です。",
            size: "xs",
            color: "#8A786D",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#D97757",
            action: {
              type: "uri",
              label: "メイトを見る",
              uri: subscribeUrl,
            },
          },
        ],
      },
    },
  };

  const res = await fetchWithRetry(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [flexMessage],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    logger.error("LINE subscribe guide Flex message failed", {
      status: res.status,
      lineUserId,
    });
    throw new Error(
      `LINE subscribe guide Flex message failed: ${res.status} - ${errorText.slice(0, 200)}`
    );
  }
};

/**
 * LINEプロフィールを取得（指定アカウントのトークンで取得）
 */
export const getLineProfile = async (
  account: Pick<LineAccountCredentials, "accessToken">,
  lineUserId: string
): Promise<LineProfile> => {
  const res = await fetchWithRetry(
    `${LINE_API_BASE}/profile/${encodeURIComponent(lineUserId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE profile fetch failed: ${res.status} - ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  };

  return {
    userId: data.userId,
    displayName: data.displayName,
    pictureUrl: data.pictureUrl ?? null,
    statusMessage: data.statusMessage ?? null,
  };
};

/**
 * リッチメニューを切り替え（指定アカウントのトークンで切替）
 */
export const switchRichMenu = async (
  account: Pick<LineAccountCredentials, "accessToken">,
  lineUserId: string,
  richMenuId: string
): Promise<void> => {
  const res = await fetchWithRetry(
    `${LINE_API_BASE}/user/${lineUserId}/richmenu/${richMenuId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`LINE rich menu switch failed: ${res.status}`);
  }
};

/**
 * Flex Messageでチェックインメニューを送信（指定アカウントのトークンで送信）
 */
export const sendCheckinFlexMessage = async (
  account: Pick<LineAccountCredentials, "accessToken">,
  lineUserId: string
): Promise<void> => {
  // JSTで今日の日付を取得
  const jstDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const flexMessage = {
    type: "flex",
    altText: "今日の調子はどうですか？",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "今日の調子は？",
            weight: "bold",
            size: "lg",
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "lg",
            contents: [
              {
                type: "button",
                action: {
                  type: "postback",
                  label: "◯ 良い",
                  data: `action=checkin&status=circle&date=${jstDate}`,
                },
                style: "primary",
                color: "#00C300",
              },
              {
                type: "button",
                action: {
                  type: "postback",
                  label: "△ 普通",
                  data: `action=checkin&status=triangle&date=${jstDate}`,
                },
                style: "primary",
                color: "#FFB800",
              },
              {
                type: "button",
                action: {
                  type: "postback",
                  label: "× 悪い",
                  data: `action=checkin&status=cross&date=${jstDate}`,
                },
                style: "primary",
                color: "#FF4444",
              },
            ],
          },
        ],
      },
    },
  };

  const res = await fetchWithRetry(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [flexMessage],
    }),
  });

  if (!res.ok) {
    throw new Error(`LINE Flex message failed: ${res.status}`);
  }
};

/**
 * postbackデータをパース
 */
export function parsePostbackData(data: string): Record<string, string> {
  const params = new URLSearchParams(data);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

/**
 * チェックインステータスの変換
 */
export function toCheckinStatus(
  status: string
): "circle" | "triangle" | "cross" | null {
  if (status === "circle" || status === "triangle" || status === "cross") {
    return status;
  }
  return null;
}
