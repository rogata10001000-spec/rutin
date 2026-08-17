import { describe, expect, it } from "vitest";
import { shouldSwitchPrimaryAccount } from "@/lib/mate-routing";

const DEFAULT_ACCOUNT = { id: "acc-default", castId: null, isDefault: true };
const MATE_A = { id: "acc-a", castId: "cast-a", isDefault: false };
const MATE_B = { id: "acc-b", castId: "cast-b", isDefault: false };


describe("shouldSwitchPrimaryAccount", () => {
  const base = {
    isDefaultAccount: false,
    accountId: MATE_B.id,
    accountCastId: MATE_B.castId,
    currentPrimaryAccountId: MATE_A.id,
    assignedCastId: "cast-a",
    isContracted: true,
  };

  it("契約者が担当外メイトに触れても会話アカウントを奪われない", () => {
    expect(shouldSwitchPrimaryAccount(base)).toBe(false);
  });

  it("契約者が担当メイトのアカウントに触れたら張り替える", () => {
    expect(
      shouldSwitchPrimaryAccount({ ...base, assignedCastId: "cast-b" })
    ).toBe(true);
  });

  it("未契約者は最後に触れたメイトアカウントに乗せる", () => {
    expect(
      shouldSwitchPrimaryAccount({ ...base, isContracted: false })
    ).toBe(true);
  });

  it("共通アカウントでは張り替えない", () => {
    expect(
      shouldSwitchPrimaryAccount({
        ...base,
        isDefaultAccount: true,
        accountId: DEFAULT_ACCOUNT.id,
        accountCastId: null,
      })
    ).toBe(false);
  });

  it("既に同じアカウントなら何もしない", () => {
    expect(
      shouldSwitchPrimaryAccount({ ...base, currentPrimaryAccountId: MATE_B.id })
    ).toBe(false);
  });
});
