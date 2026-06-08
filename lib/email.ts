import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

let cachedClient: Resend | null = null;

function getResendClient(): Resend | null {
  const { RESEND_API_KEY } = getServerEnv();
  if (!RESEND_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new Resend(RESEND_API_KEY);
  }
  return cachedClient;
}

/** 送信元アドレス（未設定時はデフォルト）。 */
function getFromAddress(): string {
  return getServerEnv().EMAIL_FROM ?? "Rutin <onboarding@resend.dev>";
}

export type SendEmailParams = {
  to: string;
  subject: string;
  /** プレーンテキスト本文（必須・フォールバック兼用） */
  text: string;
  /** HTML本文（任意） */
  html?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "error"; message?: string };

/**
 * メール送信ラッパ。RESEND_API_KEY 未設定なら送信せず not_configured を返す
 * （開発環境やメール基盤未整備時にアプリを壊さないため）。
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getResendClient();
  if (!client) {
    logger.warn("sendEmail skipped: RESEND_API_KEY not configured", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    });

    if (error) {
      logger.error("sendEmail failed", { to: params.to, message: error.message });
      return { ok: false, reason: "error", message: error.message };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("sendEmail threw", { to: params.to, message });
    return { ok: false, reason: "error", message };
  }
}

/** メール設定が有効かどうか（通知の二重送信判定などに使用）。 */
export function isEmailConfigured(): boolean {
  return Boolean(getServerEnv().RESEND_API_KEY);
}
