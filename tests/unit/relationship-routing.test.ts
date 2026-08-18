import { describe, expect, it } from "vitest";
import {
  canContractWithCast,
  pickRelationshipRow,
  MAX_CONCURRENT_MATES,
  type RelationshipRow,
} from "@/lib/relationship-routing";

const CAST_A = "cast-a";
const CAST_B = "cast-b";

const ACC_A = "acc-a";
const ACC_B = "acc-b";

const lead: RelationshipRow = { id: "row-lead", assignedCastId: null, primaryLineAccountId: null };
const withA: RelationshipRow = { id: "row-a", assignedCastId: CAST_A, primaryLineAccountId: ACC_A };
const withB: RelationshipRow = { id: "row-b", assignedCastId: CAST_B, primaryLineAccountId: ACC_B };

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

  it("共通アカウント宛は、見込み行があればそちらを使う", () => {
    expect(pickRelationshipRow([withA, lead], null)?.id).toBe("row-lead");
  });

  it("共通アカウント宛で見込み行が無ければ契約中の行へフォールバックする", () => {
    // 1メイト運用では従来「共通アカウント宛も本人の唯一の行」に載っていた。
    // ここで null を返すと見込み行が新規作成され、支払い済みの人に
    // 新規向けの契約案内が返る退行になる。
    expect(pickRelationshipRow([withA], null)?.id).toBe("row-a");
  });

  it("共通アカウント宛で複数契約なら行IDで決定的に1行へ寄せる", () => {
    // 毎回同じスレッドに載ることが重要（読み込み順で行き先が変わると混線する）
    expect(pickRelationshipRow([withB, withA], null)?.id).toBe("row-a");
    expect(pickRelationshipRow([withA, withB], null)?.id).toBe("row-a");
  });

  it("担当変更(A→B)直後: 会話が旧メイトAのアカウントに乗ったままでも取りこぼさない", () => {
    // 行の担当はBへ変わったが primary_line_account_id は旧メイトAのアカウントのまま。
    // この期間の返信はAのアカウントに届く。ここで見込み行へ落とすと
    // 「返信したのに新規向けの勧誘が返ってくる」手詰まりになる。
    const reassigned: RelationshipRow = {
      id: "row-b2",
      assignedCastId: CAST_B,
      primaryLineAccountId: ACC_A,
    };
    expect(pickRelationshipRow([reassigned], CAST_A, ACC_A)?.id).toBe("row-b2");
    // 新担当Bのアカウント宛は通常どおり担当一致で同じ行に届く
    expect(pickRelationshipRow([reassigned], CAST_B, ACC_B)?.id).toBe("row-b2");
  });

  it("該当行が無ければ null（呼び出し側が新規作成する）", () => {
    expect(pickRelationshipRow([], CAST_A)).toBeNull();
    expect(pickRelationshipRow([withA], CAST_B, ACC_B)).toBeNull();
    expect(pickRelationshipRow([], null)).toBeNull();
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
