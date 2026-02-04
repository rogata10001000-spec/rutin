import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";

const getLineAccessToken = () => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }
  return token;
};

export const verifyLineSignature = (signature: string | null, body: string) => {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    throw new Error("LINE_CHANNEL_SECRET is not set");
  }
  if (!signature) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

/**
 * LINEにテキストメッセージを送信
 */
export const pushTextMessage = async (lineUserId: string, text: string) => {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getLineAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LINE push failed: ${res.status} - ${errorText}`);
  }
};

/**
 * リッチメニューを切り替え
 */
export const switchRichMenu = async (lineUserId: string, richMenuId: string) => {
  const res = await fetch(`${LINE_API_BASE}/user/${lineUserId}/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getLineAccessToken()}` },
  });

  if (!res.ok) {
    throw new Error(`LINE rich menu switch failed: ${res.status}`);
  }
};

/**
 * Flex Messageでチェックインメニューを送信
 */
export const sendCheckinFlexMessage = async (lineUserId: string) => {
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

  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getLineAccessToken()}`,
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
