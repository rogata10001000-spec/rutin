import { describe, expect, it } from "vitest";
import {
  FUNNEL_COPY_DEFS,
  getFunnelCopyDef,
  missingRequiredVars,
  parseFunnelCopyNumber,
  renderFunnelCopy,
  type FunnelCopyDef,
} from "@/lib/funnel-copy-defs";
import { buildSubscribeGuideFlex, type SubscribeGuideFlexCopy } from "@/lib/line";

describe("renderFunnelCopy", () => {
  it("{変数} を置換する（文字列・数値）", () => {
    expect(renderFunnelCopy("{days}日間無料", { days: 7 })).toBe("7日間無料");
    expect(
      renderFunnelCopy("リンク: {subscribeUrl}", { subscribeUrl: "https://example.com/x" })
    ).toBe("リンク: https://example.com/x");
  });

  it("同じ変数の複数出現をすべて置換する", () => {
    expect(renderFunnelCopy("{days}日間は無料。{days}日後に請求。", { days: 14 })).toBe(
      "14日間は無料。14日後に請求。"
    );
  });

  it("未知の変数はそのまま残す（黙って消さない）", () => {
    expect(renderFunnelCopy("こちら {unknown} です", { days: 7 })).toBe(
      "こちら {unknown} です"
    );
  });

  it("vars 未指定でもテンプレートをそのまま返す", () => {
    expect(renderFunnelCopy("固定文言")).toBe("固定文言");
  });

  it("デフォルト文言を今日の表示と同じ形に描画する（回帰ガード）", () => {
    const heroTitle = getFunnelCopyDef("cast.hero.title");
    expect(heroTitle).toBeDefined();
    expect(renderFunnelCopy(heroTitle!.defaultValue, { days: 7 })).toBe(
      "7日間無料でお試し"
    );

    const trialCta = getFunnelCopyDef("plan.cta.trial");
    expect(renderFunnelCopy(trialCta!.defaultValue, { days: 7 })).toBe(
      "このプランで7日間無料トライアル"
    );

    const trialNotice = getFunnelCopyDef("plan.notice.trial");
    expect(
      renderFunnelCopy(trialNotice!.defaultValue, { days: 7, price: "月額¥6,980" })
    ).toBe(
      "選んだプランで7日間の無料トライアルを開始します。トライアル期間中はいつでも解約でき、料金は発生しません。トライアル終了後は月額¥6,980が自動請求されます（解約しない限り毎月更新）。"
    );
  });
});

describe("missingRequiredVars", () => {
  const def = (overrides: Partial<FunnelCopyDef>): FunnelCopyDef => ({
    key: "test.key",
    label: "テスト",
    screen: "cast",
    group: "テスト",
    defaultValue: "{days}日間・{subscribeUrl}",
    fieldType: "text",
    vars: ["days", "subscribeUrl"],
    ...overrides,
  });

  it("デフォルトに含まれる必須変数が消えていたら検出する", () => {
    expect(missingRequiredVars(def({}), "変数なしの文言")).toEqual([
      "days",
      "subscribeUrl",
    ]);
    expect(missingRequiredVars(def({}), "{days}日間だけ残した")).toEqual(["subscribeUrl"]);
  });

  it("全変数が残っていれば空", () => {
    expect(missingRequiredVars(def({}), "{subscribeUrl} から {days}日間")).toEqual([]);
  });

  it("vars 未定義なら常に空", () => {
    expect(missingRequiredVars(def({ vars: undefined }), "何でも")).toEqual([]);
  });

  it("デフォルト文言に含まれない変数は必須にしない", () => {
    // vars に列挙されていてもデフォルトが使っていなければ削除可
    expect(
      missingRequiredVars(
        def({ defaultValue: "{days}日間のみ", vars: ["days", "price"] }),
        "{days}日間"
      )
    ).toEqual([]);
  });
});

describe("parseFunnelCopyNumber", () => {
  const numberDef = getFunnelCopyDef("cast.scarcity.threshold");

  it("整数文字列をパースする（前後空白は無視）", () => {
    expect(parseFunnelCopyNumber(numberDef!, "3")).toBe(3);
    expect(parseFunnelCopyNumber(numberDef!, " 10 ")).toBe(10);
  });

  it("小数は切り捨てる", () => {
    expect(parseFunnelCopyNumber(numberDef!, "4.9")).toBe(4);
  });

  it("不正値はデフォルト（5）へフォールバックする", () => {
    expect(parseFunnelCopyNumber(numberDef!, "abc")).toBe(5);
    expect(parseFunnelCopyNumber(numberDef!, "")).toBe(0); // 空文字は Number("")=0 で有効値扱い
  });

  it("0 は有効値としてそのまま返す", () => {
    expect(parseFunnelCopyNumber(numberDef!, "0")).toBe(0);
  });
});

describe("buildSubscribeGuideFlex（文言差し替え）", () => {
  const baseCopy: SubscribeGuideFlexCopy = {
    altText: "メイトを選んで7日間無料トライアルを始められます",
    title: "メイトを選んで始めましょう",
    body: "気になる伴走メイトを選んで、まずは7日間無料でRutinをお試しいただけます。",
    expiry: "ボタンの有効期限は30分です。",
    button: "メイトを見る",
  };
  const url = "https://example.com/subscribe/cast?token=abc";

  type FlexText = { type: string; text: string };
  type FlexButton = { action: { type: string; label: string; uri: string } };
  type Flex = {
    type: string;
    altText: string;
    contents: {
      body: { contents: FlexText[] };
      footer: { contents: FlexButton[] };
    };
  };

  it("渡した文言がそのまま各要素に入る（レイアウト・色は固定）", () => {
    const flex = buildSubscribeGuideFlex(url, baseCopy) as unknown as Flex;
    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe(baseCopy.altText);
    const texts = flex.contents.body.contents.map((c) => c.text);
    expect(texts).toEqual([baseCopy.title, baseCopy.body, baseCopy.expiry]);
    const button = flex.contents.footer.contents[0];
    expect(button.action.label).toBe(baseCopy.button);
    expect(button.action.uri).toBe(url);
  });

  it("altText は LINE 上限の400字でクランプされる", () => {
    const long = "あ".repeat(500);
    const flex = buildSubscribeGuideFlex(url, {
      ...baseCopy,
      altText: long,
    }) as unknown as Flex;
    expect(flex.altText).toHaveLength(400);
    expect(flex.altText).toBe(long.slice(0, 400));
  });

  it("ボタンラベルは LINE 上限の40字でクランプされる", () => {
    const long = "ボ".repeat(60);
    const flex = buildSubscribeGuideFlex(url, {
      ...baseCopy,
      button: long,
    }) as unknown as Flex;
    expect(flex.contents.footer.contents[0].action.label).toHaveLength(40);
  });
});

describe("FUNNEL_COPY_DEFS の整合性", () => {
  it("キーは重複しない", () => {
    const keys = FUNNEL_COPY_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("vars に列挙された変数はデフォルト文言に登場する", () => {
    for (const def of FUNNEL_COPY_DEFS) {
      for (const name of def.vars ?? []) {
        expect(def.defaultValue).toContain(`{${name}}`);
      }
    }
  });
});
