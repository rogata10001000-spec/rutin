import { describe, expect, it } from "vitest";
import {
  applyDraftToBody,
  draftIndexFromKey,
  shouldKeepDraftId,
  similarityRatio,
} from "@/components/chat/aiDraftHelpers";

/**
 * AI下書きをコンポーザーへ反映するときの規則。
 * 「メイトが打ちかけた文章を黙って壊さない」ことが要件なので、
 * 空/非空・改行の扱いをここで固定する。
 */
describe("applyDraftToBody", () => {
  it("本文が空ならモードによらず下書きをそのまま入れる", () => {
    expect(applyDraftToBody("", "おはようございます", "replace")).toBe("おはようございます");
    expect(applyDraftToBody("", "おはようございます", "append")).toBe("おはようございます");
  });

  it("空白のみの本文も空として扱う（余計な改行を足さない）", () => {
    expect(applyDraftToBody("  \n ", "本文", "append")).toBe("本文");
  });

  it("replace は既存本文を捨てて置き換える", () => {
    expect(applyDraftToBody("書きかけ", "下書き", "replace")).toBe("下書き");
  });

  it("append は改行1つを挟んで末尾に足す", () => {
    expect(applyDraftToBody("書きかけ", "下書き", "append")).toBe("書きかけ\n下書き");
  });

  it("append で既に改行終わりなら改行を増やさない", () => {
    expect(applyDraftToBody("書きかけ\n", "下書き", "append")).toBe("書きかけ\n下書き");
  });
});

describe("similarityRatio", () => {
  it("同じ文章は1", () => {
    expect(similarityRatio("今日もおつかれさま", "今日もおつかれさま")).toBe(1);
  });

  it("空白の違いは無視する", () => {
    expect(similarityRatio("今日も おつかれさま", "今日もおつかれさま")).toBe(1);
  });

  it("まったく別の文章は低い", () => {
    expect(
      similarityRatio("今日もおつかれさまでした", "明日の面談は14時からでよろしいですか")
    ).toBeLessThan(0.2);
  });
});

/**
 * 採用トラッキング（aiDraftId を送信に付けるか）の判定。
 * 手直しは採用として数え、全消しして書き直した文は数えない。
 */
describe("shouldKeepDraftId", () => {
  const draft = "今日もおつかれさまでした。少しでも動けた自分をほめてあげてくださいね。";

  it("そのまま送信 → 採用", () => {
    expect(shouldKeepDraftId(draft, draft)).toBe(true);
  });

  it("語尾や絵文字の手直し → 採用", () => {
    expect(
      shouldKeepDraftId(
        draft,
        "今日もおつかれさまでした！少しでも動けた自分をほめてあげてくださいね😊"
      )
    ).toBe(true);
  });

  it("前後に書き足した（末尾追加を含む） → 採用", () => {
    expect(shouldKeepDraftId(draft, `おはようございます。\n${draft}\nまた明日ですね。`)).toBe(
      true
    );
  });

  it("一部だけ残して短くした → 採用", () => {
    expect(shouldKeepDraftId(draft, "今日もおつかれさまでした。")).toBe(true);
  });

  it("全消しして別の内容を書いた → 採用しない", () => {
    expect(
      shouldKeepDraftId(draft, "次回の面談ですが、来週の水曜15時はご都合いかがでしょうか。")
    ).toBe(false);
  });

  it("本文が空なら採用しない", () => {
    expect(shouldKeepDraftId(draft, "")).toBe(false);
    expect(shouldKeepDraftId(draft, "   ")).toBe(false);
  });

  it("下書きが空なら採用しない", () => {
    expect(shouldKeepDraftId("", "何か書いた")).toBe(false);
  });
});

describe("draftIndexFromKey", () => {
  it("1/2/3 をインデックスに変換する", () => {
    expect(draftIndexFromKey("1", 3)).toBe(0);
    expect(draftIndexFromKey("2", 3)).toBe(1);
    expect(draftIndexFromKey("3", 3)).toBe(2);
  });

  it("候補数を超えるキーは無効", () => {
    expect(draftIndexFromKey("3", 2)).toBeNull();
  });

  it("数字以外・複数文字のキーは無効（Enter などを拾わない）", () => {
    expect(draftIndexFromKey("a", 3)).toBeNull();
    expect(draftIndexFromKey("0", 3)).toBeNull();
    expect(draftIndexFromKey("Enter", 3)).toBeNull();
  });
});
