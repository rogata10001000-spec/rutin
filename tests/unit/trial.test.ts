import { describe, expect, it } from "vitest";
import {
  formatTrialDaysLabel,
  getCastPageTrialIntro,
  getCompleteTrialMessage,
  getPlanCheckoutButtonLabel,
  getPlanPageTrialNotice,
} from "@/lib/trial";
import {
  checkoutErrorCodeFromResult,
  getCheckoutErrorMessage,
} from "@/lib/subscribe-checkout-errors";
import { trialEndAtFromSubscription } from "@/lib/stripe-subscription-sync";

describe("lib/trial", () => {
  it("formatTrialDaysLabel", () => {
    expect(formatTrialDaysLabel(7)).toBe("7日間");
    expect(formatTrialDaysLabel(14)).toBe("14日間");
  });

  it("getCastPageTrialIntro uses dynamic days", () => {
    const intro = getCastPageTrialIntro(14);
    expect(intro.title).toContain("14日間");
    expect(intro.body).toContain("14日間");
  });

  it("getPlanPageTrialNotice includes auto-billing", () => {
    const text = getPlanPageTrialNotice(7, 6980);
    expect(text).toContain("7日間");
    expect(text).toContain("¥6,980");
    expect(text).toContain("自動請求");
  });

  it("getPlanCheckoutButtonLabel", () => {
    expect(getPlanCheckoutButtonLabel(7)).toBe("このプランで7日間無料トライアル");
  });

  it("getCompleteTrialMessage", () => {
    const msg = getCompleteTrialMessage(7, 6980);
    expect(msg.title).toContain("7日間");
    expect(msg.body).toContain("自動請求");
    expect(msg.body).toContain("¥6,980");
  });
});

describe("lib/subscribe-checkout-errors", () => {
  it("maps unauthorized expired", () => {
    expect(
      checkoutErrorCodeFromResult({
        code: "UNAUTHORIZED",
        message: "LINE連携の有効期限が切れています",
      })
    ).toBe("expired");
  });

  it("maps conflict capacity", () => {
    expect(
      checkoutErrorCodeFromResult({
        code: "CONFLICT",
        message: "このメイトの受付枠が満員です",
      })
    ).toBe("capacity");
  });

  it("getCheckoutErrorMessage", () => {
    expect(getCheckoutErrorMessage("expired")).toContain("期限");
    expect(getCheckoutErrorMessage(undefined)).toBeNull();
  });
});

describe("trialEndAtFromSubscription", () => {
  it("returns ISO string from trial_end", () => {
    const trialEnd = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000);
    const result = trialEndAtFromSubscription({
      trial_end: trialEnd,
    } as Parameters<typeof trialEndAtFromSubscription>[0]);
    expect(result).toBe(new Date(trialEnd * 1000).toISOString());
  });

  it("returns null when no trial_end", () => {
    expect(
      trialEndAtFromSubscription({ trial_end: null } as Parameters<
        typeof trialEndAtFromSubscription
      >[0])
    ).toBeNull();
  });
});
