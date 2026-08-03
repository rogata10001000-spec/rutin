import { describe, expect, it } from "vitest";
import { buildIlikeOrFilter } from "@/lib/postgrest-filter";

/**
 * PostgREST の or フィルタは「文字列としての構文」なので、
 * ユーザー入力をそのまま埋めるとカンマ・括弧で条件を追加できてしまう。
 * ここでは「構文文字が値として閉じ込められていること」を検証する。
 */
describe("buildIlikeOrFilter", () => {
  it("通常の検索語は各カラムのilike条件になる", () => {
    expect(buildIlikeOrFilter(["nickname", "email"], "緒方")).toBe(
      'nickname.ilike."%緒方%",email.ilike."%緒方%"'
    );
  });

  it("空文字・空白のみは null（フィルタ自体を省略する）", () => {
    expect(buildIlikeOrFilter(["nickname"], "")).toBeNull();
    expect(buildIlikeOrFilter(["nickname"], "   ")).toBeNull();
  });

  it("カンマを含む入力でも条件が増えない（値は二重引用符の中に閉じる）", () => {
    const filter = buildIlikeOrFilter(["nickname"], "x,status.eq.active");
    expect(filter).toBe('nickname.ilike."%x,status.eq.active%"');
    // 二重引用符の外にカンマが漏れていない = 条件は1つのまま
    expect(filter!.replace(/"[^"]*"/g, "")).not.toContain(",");
  });

  it("括弧を含む入力でも or(...) を閉じられない", () => {
    const filter = buildIlikeOrFilter(["nickname"], 'x),or(status.eq.active');
    expect(filter!.replace(/"[^"]*"/g, "")).not.toMatch(/[()]/);
  });

  it("LIKEワイルドカードは打ち消され、全件マッチにならない", () => {
    // PostgRESTの二重引用符を1段はがすと ILIKE には `\%`（エスケープ済みの%）が渡るため、
    // ここでのバックスラッシュは2つになる（実DBに対して0件になることを確認済み）。
    expect(buildIlikeOrFilter(["nickname"], "%")).toBe('nickname.ilike."%\\\\%%"');
    expect(buildIlikeOrFilter(["nickname"], "_")).toBe('nickname.ilike."%\\\\_%"');
  });

  it("二重引用符とバックスラッシュはエスケープされる", () => {
    expect(buildIlikeOrFilter(["nickname"], 'a"b')).toBe('nickname.ilike."%a\\"b%"');
    expect(buildIlikeOrFilter(["nickname"], "a\\b")).toBe('nickname.ilike."%a\\\\\\\\b%"');
  });

  it("前後の空白は無視する", () => {
    expect(buildIlikeOrFilter(["nickname"], "  緒方  ")).toBe('nickname.ilike."%緒方%"');
  });
});
