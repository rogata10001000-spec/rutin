import { describe, expect, it } from "vitest";
import { shouldRejectAsWrongMate, shouldSwitchPrimaryAccount } from "@/lib/mate-routing";

const DEFAULT_ACCOUNT = { id: "acc-default", castId: null, isDefault: true };
const MATE_A = { id: "acc-a", castId: "cast-a", isDefault: false };
const MATE_B = { id: "acc-b", castId: "cast-b", isDefault: false };

describe("shouldRejectAsWrongMate", () => {
  it("共通アカウント宛は常に受け取る", () => {
    expect(
      shouldRejectAsWrongMate({
        accountId: DEFAULT_ACCOUNT.id,
        accountCastId: DEFAULT_ACCOUNT.castId,
        isDefaultAccount: true,
        assignedCastId: "cast-a",
        primaryLineAccountId: MATE_A.id,
      })
    ).toBe(false);
  });

  it("担当メイトのアカウント宛は受け取る", () => {
    expect(
      shouldRejectAsWrongMate({
        accountId: MATE_A.id,
        accountCastId: MATE_A.castId,
        isDefaultAccount: false,
        assignedCastId: "cast-a",
        primaryLineAccountId: MATE_A.id,
      })
    ).toBe(false);
  });

  it("担当外メイトのアカウント宛は弾く（静かな混線を防ぐ）", () => {
    expect(
      shouldRejectAsWrongMate({
        accountId: MATE_B.id,
        accountCastId: MATE_B.castId,
        isDefaultAccount: false,
        assignedCastId: "cast-a",
        primaryLineAccountId: MATE_A.id,
      })
    ).toBe(true);
  });

  it("担当変更直後: 会話が旧メイトのアカウントに乗っている間はそこへの返信を受け取る", () => {
    // 担当は B に変わったが、primary は旧メイト A のまま。
    // B の返信も A のアカウントから送られるため、ここを弾くと会話が手詰まりになる。
    expect(
      shouldRejectAsWrongMate({
        accountId: MATE_A.id,
        accountCastId: MATE_A.castId,
        isDefaultAccount: false,
        assignedCastId: "cast-b",
        primaryLineAccountId: MATE_A.id,
      })
    ).toBe(false);
  });

  it("未契約（担当未決定）は弾かない（従来の案内フローに乗せる）", () => {
    expect(
      shouldRejectAsWrongMate({
        accountId: MATE_B.id,
        accountCastId: MATE_B.castId,
        isDefaultAccount: false,
        assignedCastId: null,
        primaryLineAccountId: null,
      })
    ).toBe(false);
  });
});

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
