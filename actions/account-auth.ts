"use server";

import { headers } from "next/headers";
import { Result } from "./types";
import { requestEmailLogin as requestEmailLoginCore } from "@/lib/email-login";
import { normalizeEmail } from "@/lib/email-address";
import { checkRateLimit } from "@/lib/rate-limit";

export type RequestEmailLoginResult = Result<{ sent: true }>;

/**
 * メールログインリンクを送信する。
 * セキュリティ:
 * - ユーザー列挙防止のため、宛先の有無に関わらず常に成功を返す
 * - メール単位・IP単位でレート制限する
 */
export async function requestEmailLogin(rawEmail: string): Promise<RequestEmailLoginResult> {
  const email = normalizeEmail(rawEmail);

  // 形式不正でも列挙を避けるため成功扱い（送信はしない）
  if (!email) {
    return { ok: true, data: { sent: true } };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for") ?? "unknown";

  const emailOk = checkRateLimit({
    key: `email-login:email:${email}`,
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
  });
  const ipOk = checkRateLimit({
    key: `email-login:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
  });

  // レート超過時も列挙を避けるため成功扱い（送信はしない）
  if (!emailOk || !ipOk) {
    return { ok: true, data: { sent: true } };
  }

  await requestEmailLoginCore(email);
  return { ok: true, data: { sent: true } };
}
