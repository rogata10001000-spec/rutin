import { describe, expect, it } from "vitest";
import {
  canContractWithCast,
  pickRelationshipRow,
  MAX_CONCURRENT_MATES,
  type RelationshipRow,
} from "@/lib/relationship-routing";

const CAST_A = "cast-a";
const CAST_B = "cast-b";

const lead: RelationshipRow = { id: "row-lead", assignedCastId: null };
const withA: RelationshipRow = { id: "row-a", assignedCastId: CAST_A };
const withB: RelationshipRow = { id: "row-b", assignedCastId: CAST_B };

describe("pickRelationshipRow", () => {
  it("契約中メイトのアカウント宛は、そのメイトとの関係行に着地する", () => {
    expect(pickRelationshipRow([withA, withB], CAST_A)?.id).toBe("row-a");
    expect(pickRelationshipRow([withA, withB], CAST_B)?.id).toBe("row-b");
  });

  it("複数メイト契約でも、他メイトの会話に混ざらない", () => {
    // これが崩れると、メイトBへ送ったメッセージがメイトAのトークに現れる
    const picked = pickRelationshipRow([withA, withB, lead], CAST_B);
    expect(picked?.id).toBe("row-b");
    expect(picked?.assignedCastId).toBe(CAST_B);
  });

  it("未契約メイトのアカウント宛は見込み行に着地する", () => {
    expect(pickRelationshipRow([withA, lead], CAST_B)?.id).toBe("row-lead");
  });

  it("共通アカウント宛は契約中の行に寄せず見込み行を使う", () => {
    // 共通アカウントは特定メイトとの会話ではないため、契約中メイトの履歴に混ぜない
    expect(pickRelationshipRow([withA, lead], null)?.id).toBe("row-lead");
  });

  it("該当行が無ければ null（呼び出し側が新規作成する）", () => {
    expect(pickRelationshipRow([], CAST_A)).toBeNull();
    expect(pickRelationshipRow([withA], CAST_B)).toBeNull();
    expect(pickRelationshipRow([withA], null)).toBeNull();
  });

  it("従来の1メイト運用（行が1つだけ）で挙動が変わらない", () => {
    expect(pickRelationshipRow([withA], CAST_A)?.id).toBe("row-a");
    expect(pickRelationshipRow([lead], CAST_A)?.id).toBe("row-lead");
  });
});

describe("canContractWithCast", () => {
  it("契約中のメイトは追加契約できない", () => {
    const r = canContractWithCast({
      castId: CAST_A,
      liveCastIds: [CAST_A],
      maxConcurrent: MAX_CONCURRENT_MATES,
    });
    expect(r).toBe("already_contracted");
  });

  it("別のメイトは追加契約できる", () => {
    expect(
      canContractWithCast({ castId: CAST_B, liveCastIds: [CAST_A], maxConcurrent: 3 })
    ).toBe("ok");
  });

  it("解約済みのメイトは再契約できる（liveCastIds に入らない）", () => {
    expect(canContractWithCast({ castId: CAST_A, liveCastIds: [], maxConcurrent: 3 })).toBe("ok");
  });

  it("同時契約数の上限で止まる", () => {
    expect(
      canContractWithCast({ castId: "cast-d", liveCastIds: ["a", "b", "c"], maxConcurrent: 3 })
    ).toBe("limit_reached");
  });

  it("上限判定より先に「契約済み」を返す（理由を取り違えない）", () => {
    // 上限に達している状態で契約中メイトを選んだとき、
    // 「上限に達しました」と出すと利用者は原因を誤解する
    expect(
      canContractWithCast({ castId: "a", liveCastIds: ["a", "b", "c"], maxConcurrent: 3 })
    ).toBe("already_contracted");
  });
});
