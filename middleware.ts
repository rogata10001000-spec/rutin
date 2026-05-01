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

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(input.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function verifyUserSessionToken(token: string): Promise<boolean> {
  const secret = process.env.LINE_USER_TOKEN_SECRET;
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart))) as {
      alg?: string;
    };
    if (header.alg !== "HS256") return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as {
      line_user_id?: unknown;
      exp?: unknown;
    };

    if (typeof payload.line_user_id !== "string" || typeof payload.exp !== "number") {
      return false;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(base64UrlToBytes(signaturePart)),
      toArrayBuffer(new TextEncoder().encode(`${headerPart}.${payloadPart}`))
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
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
  const validToken = await verifyUserSessionToken(token);
  if (!validToken) {
    response.cookies.delete(USER_SESSION_COOKIE);
    return response;
  }

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
