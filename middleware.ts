import { NextRequest, NextResponse } from "next/server";
import { USER_SESSION_COOKIE } from "@/lib/constants";

const WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 180;

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

function keyFor(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  return `${ip}:${req.nextUrl.pathname}`;
}

function isRateLimited(req: NextRequest): boolean {
  const now = Date.now();
  const key = keyFor(req);
  const current = store.get(key);
  if (!current || current.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQ_PER_WINDOW;
}

export function middleware(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith("/api/webhooks/") ||
    req.nextUrl.pathname.startsWith("/api/")
  ) {
    if (isRateLimited(req)) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.next();
  }

  const target = req.nextUrl.clone();
  target.searchParams.delete("token");

  const response = NextResponse.redirect(target);
  response.cookies.set({
    name: USER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
