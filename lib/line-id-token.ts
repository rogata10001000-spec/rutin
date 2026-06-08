import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export type VerifiedLineIdToken = {
  lineUserId: string;
  /** メール（LIFFのスコープに email がある場合のみ） */
  email: string | null;
};

/**
 * LIFF の IDトークンを LINE 公式エンドポイントで検証する。
 *
 * クライアントの getProfile().userId は信用せず、署名付きIDトークンを
 * サーバーで検証して line_user_id（sub）を確定する。
 *
 * @returns 検証成功なら lineUserId を返す。未設定・検証失敗は null。
 */
export async function verifyLineIdToken(
  idToken: string
): Promise<VerifiedLineIdToken | null> {
  const channelId = getServerEnv().LINE_LIFF_CHANNEL_ID;
  if (!channelId) {
    logger.warn("verifyLineIdToken skipped: LINE_LIFF_CHANNEL_ID not configured");
    return null;
  }
  if (!idToken) return null;

  try {
    const body = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    });

    const res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      logger.warn("verifyLineIdToken: verify endpoint rejected token", {
        status: res.status,
      });
      return null;
    }

    const payload = (await res.json()) as {
      sub?: string;
      aud?: string;
      email?: string;
      exp?: number;
    };

    // aud（チャネルID）の一致を二重確認
    if (payload.aud !== channelId) {
      logger.warn("verifyLineIdToken: aud mismatch");
      return null;
    }
    if (!payload.sub) {
      logger.warn("verifyLineIdToken: missing sub");
      return null;
    }

    return {
      lineUserId: payload.sub,
      email: payload.email ?? null,
    };
  } catch (err) {
    logger.error("verifyLineIdToken threw", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}
