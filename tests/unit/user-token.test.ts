import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    LINE_USER_TOKEN_SECRET: "test-secret-test-secret-test-secret-123456",
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({}),
}));

import {
  generateUserToken,
  generateUserSessionToken,
  verifyUserToken,
} from "@/lib/auth";

describe("lib/auth user tokens", () => {
  it("line-only token carries lineUserId and null endUserId", () => {
    const token = generateUserToken("Uline123");
    const result = verifyUserToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lineUserId).toBe("Uline123");
      expect(result.endUserId).toBeNull();
    }
  });

  it("session token carries both endUserId and lineUserId", () => {
    const token = generateUserSessionToken({
      endUserId: "eu-1",
      lineUserId: "Uline999",
    });
    const result = verifyUserToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endUserId).toBe("eu-1");
      expect(result.lineUserId).toBe("Uline999");
    }
  });

  it("session token without lineUserId yields null lineUserId", () => {
    const token = generateUserSessionToken({ endUserId: "eu-2" });
    const result = verifyUserToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endUserId).toBe("eu-2");
      expect(result.lineUserId).toBeNull();
    }
  });

  it("rejects garbage tokens", () => {
    const result = verifyUserToken("not-a-jwt");
    expect(result.ok).toBe(false);
  });
});
