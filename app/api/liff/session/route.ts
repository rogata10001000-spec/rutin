import { NextRequest, NextResponse } from "next/server";
import { verifyLineIdToken } from "@/lib/line-id-token";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { generateUserSessionToken, generateUserToken } from "@/lib/auth";
import { USER_SESSION_COOKIE } from "@/lib/constants";
import { normalizeEmail } from "@/lib/email-address";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 30; // 30分

/**
 * LIFF の IDトークンを検証し、本人のセッションCookieを発行する。
 *
 * フロー: /liff/mypage が liff.getIDToken() を POST → ここで検証 →
 *         line_user_id 確定 → end_user 解決 → USER_SESSION_COOKIE 発行。
 */
export async function POST(req: NextRequest) {
  let idToken: string | undefined;
  try {
    const body = (await req.json()) as { idToken?: unknown };
    if (typeof body.idToken === "string") {
      idToken = body.idToken;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ ok: false, error: "missing_id_token" }, { status: 400 });
  }

  const verified = await verifyLineIdToken(idToken);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "verification_failed" }, { status: 401 });
  }

  const lineUserId = verified.lineUserId;
  const supabase = createAdminSupabaseClient();

  const { data: endUser } = await supabase
    .from("end_users")
    .select("id, email")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  // IDトークンに email があり、未登録なら補完（best-effort・衝突時は無視）
  const verifiedEmail = normalizeEmail(verified.email);
  if (endUser && verifiedEmail && !endUser.email) {
    const { error: emailErr } = await supabase
      .from("end_users")
      .update({ email: verifiedEmail })
      .eq("id", endUser.id)
      .is("email", null);
    if (emailErr) {
      logger.warn("liff/session: email capture skipped", {
        endUserId: endUser.id,
        message: emailErr.message,
      });
    }
  }

  // end_user があれば本人IDアンカー付き、なければ line 専用セッション（契約なし表示）
  const sessionToken = endUser
    ? generateUserSessionToken({ endUserId: endUser.id, lineUserId })
    : generateUserToken(lineUserId);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: USER_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
