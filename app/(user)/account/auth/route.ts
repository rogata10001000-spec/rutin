import { NextRequest, NextResponse } from "next/server";
import { consumeLoginToken } from "@/lib/email-login";
import { generateUserSessionToken } from "@/lib/auth";
import { USER_SESSION_COOKIE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 30; // 30分

/**
 * メールマジックリンクの着地点。
 * `?lt=` の単回トークンを検証・消費し、本人IDのセッションCookieを発行する。
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const rawToken = req.nextUrl.searchParams.get("lt");

  if (!rawToken) {
    return NextResponse.redirect(new URL("/account/login?error=invalid", origin));
  }

  const consumed = await consumeLoginToken(rawToken);
  if (!consumed) {
    return NextResponse.redirect(new URL("/account/login?error=expired", origin));
  }

  const sessionToken = generateUserSessionToken({
    endUserId: consumed.endUserId,
    lineUserId: consumed.lineUserId,
  });

  const response = NextResponse.redirect(new URL("/account/plan", origin));
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
