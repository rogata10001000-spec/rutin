import { describe, expect, it, beforeAll } from "vitest";

// lib/ai-drafts.ts は "server-only" を持つため、テスト環境では
// 実際のモジュール解決前に env を用意しておく。
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.LINE_CHANNEL_SECRET = "line-secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
  process.env.LINE_USER_TOKEN_SECRET = "x".repeat(32);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
});

type Mod = typeof import("@/lib/ai-drafts");
let mod: Mod;

beforeAll(async () => {
  mod = await import("@/lib/ai-drafts");
});

describe("parseAiResponse", () => {
  it("3ラベルをそれぞれの案として抽出する", () => {
    const drafts = mod.parseAiResponse(
      "[共感]\nつらかったですね。\n\n[称賛]\nよく続けています！\n\n[提案]\n明日は5分だけ試しませんか？"
    );
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toEqual({ type: "empathy", body: "つらかったですね。" });
    expect(drafts[1].type).toBe("praise");
    expect(drafts[2].body).toContain("5分");
  });

  it("順序が入れ替わっていても正しく抽出する", () => {
    const drafts = mod.parseAiResponse("[提案]\nAです\n\n[共感]\nBです");
    expect(drafts.map((d) => d.type).sort()).toEqual(["empathy", "suggest"]);
    expect(drafts.find((d) => d.type === "suggest")?.body).toBe("Aです");
  });

  it("一部のラベルしか無くても取れた分だけ返す", () => {
    const drafts = mod.parseAiResponse("[共感]\nそうだったんですね。");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].type).toBe("empathy");
  });

  it("ラベルが無い応答は全体を共感として扱う（黙って0件にしない）", () => {
    const drafts = mod.parseAiResponse("ラベルのない普通の文章です");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({ type: "empathy", body: "ラベルのない普通の文章です" });
  });

  it("空応答では何も返さない", () => {
    expect(mod.parseAiResponse("   ")).toHaveLength(0);
  });

  it("フォールバック時は300文字で打ち切る", () => {
    const drafts = mod.parseAiResponse("あ".repeat(500));
    expect(drafts[0].body).toHaveLength(300);
  });
});

describe("buildDraftUserPrompt", () => {
  const baseContext = {
    messages: [
      { direction: "in", body: "最近ねむれてません" },
      { direction: "out", body: "無理しないでくださいね" },
    ],
    pinnedMemos: [{ category: "profile", latest_body: "夜勤あり" }],
    checkins: [{ date: "2026-08-05", status: "triangle" }],
    castStyle: "やわらかい丁寧語",
    castName: "みか",
    fewShotExamples: ["おはようございます😊 今日はどうですか？"],
    userProfile: { nickname: "さくら", planCode: "standard", birthday: null },
    hasOpenRisk: false,
  };

  it("会話履歴は古い順に並べ、元配列を破壊しない", () => {
    const messages = [...baseContext.messages];
    const prompt = mod.buildDraftUserPrompt({ ...baseContext, messages }, null);
    // 取得は新しい順なので、プロンプトでは 2番目→1番目 の順（＝古い順）になる
    expect(prompt.indexOf("メイト: 無理しないでくださいね")).toBeLessThan(
      prompt.indexOf("ユーザー: 最近ねむれてません")
    );
    // 呼び出し元の配列が反転していないこと（スナップショットの順序が壊れる不具合の防止）
    expect(messages[0].body).toBe("最近ねむれてません");
  });

  it("スタイル・実返信例・ユーザー情報を含める", () => {
    const prompt = mod.buildDraftUserPrompt(baseContext, null);
    expect(prompt).toContain("やわらかい丁寧語");
    expect(prompt).toContain("おはようございます😊");
    expect(prompt).toContain("さくら");
    expect(prompt).toContain("みか");
  });

  it("指示があれば専用セクションとして入る", () => {
    const prompt = mod.buildDraftUserPrompt(baseContext, "明日の予定を聞いて");
    expect(prompt).toContain("メイトからの指示");
    expect(prompt).toContain("明日の予定を聞いて");
  });

  it("指示が無ければ指示セクションを出さない", () => {
    expect(mod.buildDraftUserPrompt(baseContext, null)).not.toContain("メイトからの指示");
  });

  it("スタイル未設定なら汎用トーンのフォールバックを使う", () => {
    const prompt = mod.buildDraftUserPrompt({ ...baseContext, castStyle: null }, null);
    expect(prompt).toContain("特に指定なし");
  });

  it("未解決リスクがあると注意書きが入る", () => {
    const prompt = mod.buildDraftUserPrompt({ ...baseContext, hasOpenRisk: true }, null);
    expect(prompt).toContain("リスクフラグ");
  });

  it("空の文脈でも壊れない（履歴なし表記になる）", () => {
    const prompt = mod.buildDraftUserPrompt(
      {
        messages: [],
        pinnedMemos: [],
        checkins: [],
        castStyle: null,
        castName: null,
        fewShotExamples: [],
        userProfile: null,
        hasOpenRisk: false,
      },
      null
    );
    expect(prompt).toContain("（履歴なし）");
    expect(prompt).toContain("（なし）");
  });
});
