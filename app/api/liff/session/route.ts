import { NextRequest, NextResponse } from "next/server";
import { verifyLineIdToken } from "@/lib/line-id-token";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { generateUserSessionToken, generateUserToken } from "@/lib/auth";
import { USER_SESSION_COOKIE } from "@/lib/constants";
import { normalizeEmail } from "@/lib/email-address";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getRelationshipsByLineUserId } from "@/lib/person";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 30; // 30分

/**
 * LIFF の IDトークンを検証し、本人のセッションCookieを発行する。
 *
 * フロー: /liff/mypage が liff.getIDToken() を POST → ここで検証 →
 *         line_user_id 確定 → end_user 解決 → USER_SESSION_COOKIE 発行。
 */
export async function POST(req: NextRequest) {
  // 公開エンドポイントのため、IDトークン検証（LINEへの外部呼び出し）の前に
  // IP単位で分散レート制限する（Upstash設定時は分散、未設定時はメモリにfail-open）。
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit({
    key: `liff-session:ip:${ip}`,
    windowMs: 5 * 60 * 1000,
    maxRequests: 30,
  });
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

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

  // 複数メイト契約では同じUIDに関係行が複数ありうるため maybeSingle は使えない
  // （2行目ができた瞬間にエラー→エラー破棄でセッションが縮退する）。
  // アンカーは最も古い行に固定する（毎回同じ行を指す＝決定的）。
  let endUser: { id: string } | null = null;
  try {
    const relationships = await getRelationshipsByLineUserId(supabase, lineUserId);
    const anchor = [...relationships].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )[0];
    if (anchor) {
      endUser = { id: anchor.endUserId };
    }
  } catch (err) {
    logger.warn("liff/session: relationship lookup failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  // IDトークンに email があれば補完（best-effort）。
  // .is("email", null) ガード＋emailのUNIQUE制約により、
  // 既に値がある／同じ人の別の行が持っている場合は何も起きない（衝突はwarnのみ）。
  const verifiedEmail = normalizeEmail(verified.email);
  if (endUser && verifiedEmail) {
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
