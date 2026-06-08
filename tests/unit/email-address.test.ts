import { describe, expect, it } from "vitest";
import { normalizeEmail, isValidEmail } from "@/lib/email-address";

describe("lib/email-address", () => {
  it("trims and lowercases valid emails", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("returns null for empty or nullish input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("returns null for malformed addresses", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("foo@bar")).toBeNull();
    expect(normalizeEmail("foo @bar.com")).toBeNull();
    expect(normalizeEmail("@bar.com")).toBeNull();
  });

  it("isValidEmail mirrors normalizeEmail", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
  });
});
