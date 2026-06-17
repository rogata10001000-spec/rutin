import { describe, it, expect, beforeAll } from "vitest";

// getServerEnv が必須envを要求するため、import 前に用意してから動的import
type Mod = typeof import("@/lib/rate-limit");
let checkRateLimit: Mod["checkRateLimit"];

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.LINE_CHANNEL_SECRET = "line-secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
  process.env.LINE_USER_TOKEN_SECRET = "x".repeat(32);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
  // UPSTASH 未設定 → インメモリ経路を検証
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  ({ checkRateLimit } = await import("@/lib/rate-limit"));
});

describe("checkRateLimit (in-memory fallback)", () => {
  it("maxRequestsまで許可し、超過で拒否する", async () => {
    const key = `test:${Math.random()}`;
    const params = { key, windowMs: 60_000, maxRequests: 3 };
    expect(await checkRateLimit(params)).toBe(true);
    expect(await checkRateLimit(params)).toBe(true);
    expect(await checkRateLimit(params)).toBe(true);
    expect(await checkRateLimit(params)).toBe(false);
  });

  it("キーが異なれば独立してカウントする", async () => {
    const a = { key: `a:${Math.random()}`, windowMs: 60_000, maxRequests: 1 };
    const b = { key: `b:${Math.random()}`, windowMs: 60_000, maxRequests: 1 };
    expect(await checkRateLimit(a)).toBe(true);
    expect(await checkRateLimit(b)).toBe(true);
    expect(await checkRateLimit(a)).toBe(false);
  });

  it("ウィンドウ経過でリセットされる", async () => {
    const key = `reset:${Math.random()}`;
    expect(await checkRateLimit({ key, windowMs: 1, maxRequests: 1 })).toBe(true);
    expect(await checkRateLimit({ key, windowMs: 1, maxRequests: 1 })).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(await checkRateLimit({ key, windowMs: 1, maxRequests: 1 })).toBe(true);
  });
});
