import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { fetchWithRetry } from "@/lib/http-client";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/types";

// =============================================================
// AI返信案の生成コア。
//
// Server Action（手動・一括）と LINE webhook（事前生成）の両方から使うため、
// 認証・権限チェックを持たない純粋な生成エンジンとしてここに集約する。
// 呼び出し側の責務: 権限確認（canAccessUser 等）と日次上限の判定。
//
// 設計上の要点:
// - スタイル・few-shot は「担当メイト」のものを使う（操作者ではない。
//   旧実装は操作者のIDでスタイルを引いており、管理者の代行生成で
//   メイトの口調にならないバグがあった）
// - モデル・上限は env で管理（lib/env.ts AI_MODEL 等）
// - 共通の指示文は system ブロックに置き prompt caching を効かせる
//   （全リクエストで再利用されるため入力コストが下がる）
// - トークン使用量・モデル名を ai_draft_requests に記録し、コストを実測可能にする
// =============================================================

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export type AiDraftType = Database["public"]["Tables"]["ai_drafts"]["Row"]["type"];

export type GeneratedDraft = {
  id: string;
  type: AiDraftType;
  body: string;
};

export type DraftGenerationSource = "manual" | "bulk" | "pregen";

export type DraftGenerationResult =
  | { ok: true; requestId: string; drafts: GeneratedDraft[]; error?: undefined }
  | { ok: false; error: string; requestId?: undefined; drafts?: undefined };

// 生成は10秒を超えることがある。短いタイムアウトで切ると
// 「課金だけされて結果は捨てられ、さらにリトライで二重課金」になるため、
// 余裕を持たせてリトライは1回に抑える。
const AI_TIMEOUT_MS = 45_000;
const AI_RETRIES = 1;

/** 生成の役割定義（全リクエスト共通・prompt caching の対象） */
const SYSTEM_PROMPT = `あなたは習慣化サポートサービス「Rutin」の伴走メイトとして、ユーザーへの返信案を3つ作成するアシスタントです。

守ること:
- Bot感のない、人間らしい自然な日本語で書く
- 「メイトの実際の返信例」がある場合は、その口調・絵文字の使い方・文の長さ・呼びかけ方を最優先で真似る
- 「メイトのスタイル」の記述があれば従う
- ユーザーの直近の発言に必ず反応する（無視して一般論を書かない）
- 医療・診断・治療に踏み込む助言はしない。深刻な不調がうかがえる場合は、専門機関への相談をやさしく促す
- 各返信は100文字程度

出力形式（この3ラベルを必ず使う）:
[共感]
（ユーザーの気持ちに寄り添う返信）

[称賛]
（ユーザーの行動や努力を褒める返信）

[提案]
（次のアクションを提案する返信）`;

type DraftContext = {
  messages: { direction: string; body: string }[];
  pinnedMemos: { category: string; latest_body: string }[];
  checkins: { date: string; status: string }[];
  castStyle: string | null;
  castName: string | null;
  fewShotExamples: string[];
  userProfile: {
    nickname: string;
    planCode: string;
    birthday: string | null;
  } | null;
  hasOpenRisk: boolean;
};

/**
 * 生成に使う文脈を収集する。
 * castId は「担当メイト」を渡すこと（スタイル・few-shot はこのメイトのもの）。
 */
async function collectContext(
  supabase: SupabaseAdmin,
  endUserId: string,
  castId: string | null
): Promise<DraftContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    { data: messages },
    { data: pinnedMemos },
    { data: checkins },
    { data: cast },
    { data: fewShot },
    { data: user },
    { data: openRisk },
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("end_user_id", endUserId)
      .eq("message_type", "text")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("memos")
      .select("category, latest_body")
      .eq("end_user_id", endUserId)
      .eq("pinned", true)
      .limit(10),
    supabase
      .from("checkins")
      .select("date, status")
      .eq("end_user_id", endUserId)
      .gte("date", sevenDaysAgo.toISOString().split("T")[0])
      .order("date", { ascending: false }),
    castId
      ? supabase
          .from("staff_profiles")
          .select("style_summary, display_name")
          .eq("id", castId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // few-shot: このメイトが「自分の声で」送った直近の返信（代理送信は除外）。
    // 別ユーザー宛も含めることで、履歴が薄い相手でも口調を再現できる。
    castId
      ? supabase
          .from("messages")
          .select("body")
          .eq("sent_by_staff_id", castId)
          .eq("direction", "out")
          .eq("message_type", "text")
          .eq("sent_as_proxy", false)
          .neq("end_user_id", endUserId)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: null }),
    supabase
      .from("end_users")
      .select("nickname, plan_code, birthday")
      .eq("id", endUserId)
      .maybeSingle(),
    supabase
      .from("risk_flags")
      .select("id")
      .eq("end_user_id", endUserId)
      .in("status", ["open", "ack"])
      .limit(1)
      .maybeSingle(),
  ]);

  // few-shot は短すぎる相槌と長文を除き、多様な3〜5件に絞る
  const fewShotExamples = (fewShot ?? [])
    .map((m) => m.body.trim())
    .filter((b) => b.length >= 20 && b.length <= 300)
    .slice(0, 5);

  return {
    messages: (messages ?? []).map((m) => ({ direction: m.direction, body: m.body })),
    pinnedMemos: pinnedMemos ?? [],
    checkins: checkins ?? [],
    castStyle: cast?.style_summary ?? null,
    castName: cast?.display_name ?? null,
    fewShotExamples,
    userProfile: user
      ? { nickname: user.nickname, planCode: user.plan_code, birthday: user.birthday }
      : null,
    hasOpenRisk: Boolean(openRisk),
  };
}

/** 誕生日（yyyy-mm-dd）が日本時間の今日と同じ月日か */
function isBirthdayTodayJst(birthday: string | null): boolean {
  if (!birthday) return false;
  const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return birthday.slice(5, 10) === todayJst.slice(5, 10);
}

/** ユーザーメッセージ部分のプロンプトを構築する（system は SYSTEM_PROMPT 固定） */
export function buildDraftUserPrompt(
  context: DraftContext,
  instruction: string | null
): string {
  // 表示は新しい順で取得しているため、時系列（古→新）に並べ直す
  // （元配列を破壊しないよう toReversed 相当のコピーで行う）
  const messageHistory = [...context.messages]
    .reverse()
    .map((m) => `${m.direction === "in" ? "ユーザー" : "メイト"}: ${m.body}`)
    .join("\n");

  const memos = context.pinnedMemos
    .map((m) => `[${m.category}] ${m.latest_body}`)
    .join("\n");

  const checkinStatus = context.checkins.map((c) => `${c.date}: ${c.status}`).join(", ");

  const fewShot = context.fewShotExamples.map((e) => `- ${e}`).join("\n");

  const profileParts: string[] = [];
  if (context.userProfile) {
    profileParts.push(`ニックネーム: ${context.userProfile.nickname}`);
    profileParts.push(`プラン: ${context.userProfile.planCode}`);
    if (isBirthdayTodayJst(context.userProfile.birthday)) {
      profileParts.push("今日が誕生日");
    }
  }
  if (context.hasOpenRisk) {
    profileParts.push(
      "未解決のリスクフラグあり（心身の不調のサインに注意し、特に丁寧に寄り添う）"
    );
  }

  return `## メイト${context.castName ? `（${context.castName}）` : ""}のスタイル
${context.castStyle ?? "特に指定なし（自然で親しみやすい口調で）"}

## メイトの実際の返信例（口調の参考。内容は真似ない）
${fewShot || "（なし）"}

## ユーザー情報
${profileParts.join(" / ") || "（なし）"}

## 会話履歴（直近・古い順）
${messageHistory || "（履歴なし）"}

## ピン留めメモ（重要情報）
${memos || "（なし）"}

## 直近7日のチェックイン
${checkinStatus || "（なし）"}
${instruction ? `\n## メイトからの指示（今回の返信で必ず反映すること）\n${instruction}\n` : ""}
上記を踏まえて、[共感]・[称賛]・[提案]の3案を作成してください。`;
}

/** AIレスポンスをパースする */
export function parseAiResponse(content: string): { type: AiDraftType; body: string }[] {
  const drafts: { type: AiDraftType; body: string }[] = [];

  const empathyMatch = content.match(/\[共感\]\s*([\s\S]*?)(?=\[称賛\]|\[提案\]|$)/);
  const praiseMatch = content.match(/\[称賛\]\s*([\s\S]*?)(?=\[共感\]|\[提案\]|$)/);
  const suggestMatch = content.match(/\[提案\]\s*([\s\S]*?)(?=\[共感\]|\[称賛\]|$)/);

  if (empathyMatch?.[1]?.trim()) drafts.push({ type: "empathy", body: empathyMatch[1].trim() });
  if (praiseMatch?.[1]?.trim()) drafts.push({ type: "praise", body: praiseMatch[1].trim() });
  if (suggestMatch?.[1]?.trim()) drafts.push({ type: "suggest", body: suggestMatch[1].trim() });

  // パースできなかった場合は全体を共感として使用
  if (drafts.length === 0 && content.trim()) {
    drafts.push({ type: "empathy", body: content.trim().slice(0, 300) });
  }

  return drafts;
}

/**
 * AI返信案を生成して DB に記録する（権限チェックは呼び出し側の責務）。
 *
 * @param params.castId 担当メイトのID（スタイル・few-shot の源。null なら汎用トーン）
 * @param params.requestedBy 記録上のリクエスト者（pregen では担当メイトを入れる）
 */
export async function generateDraftsCore(
  supabase: SupabaseAdmin,
  params: {
    endUserId: string;
    castId: string | null;
    requestedBy: string;
    instruction?: string | null;
    source: DraftGenerationSource;
  }
): Promise<DraftGenerationResult> {
  const env = getServerEnv();
  if (!env.AI_PROVIDER_KEY) {
    return { ok: false, error: "AI下書き機能の設定が未完了です" };
  }

  const jstDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const context = await collectContext(supabase, params.endUserId, params.castId);

  // 鮮度判定用: 生成時点の最新メッセージID
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("end_user_id", params.endUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let parsedDrafts: { type: AiDraftType; body: string }[] = [];
  let success = true;
  let errorMessage: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.AI_PROVIDER_KEY,
        "anthropic-version": "2023-06-01",
      },
      timeoutMs: AI_TIMEOUT_MS,
      retries: AI_RETRIES,
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 1024,
        // 役割定義は全リクエスト共通なので cache_control で prompt caching を効かせる
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: buildDraftUserPrompt(context, params.instruction ?? null),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    const content: string = result.content?.[0]?.text ?? "";
    inputTokens = result.usage?.input_tokens ?? null;
    outputTokens = result.usage?.output_tokens ?? null;

    parsedDrafts = parseAiResponse(content);
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  const { data: request, error: reqError } = await supabase
    .from("ai_draft_requests")
    .insert({
      end_user_id: params.endUserId,
      requested_by: params.requestedBy,
      jst_date: jstDate,
      context_snapshot: {
        messages: context.messages,
        pinnedMemos: context.pinnedMemos,
        checkins: context.checkins,
        castStyle: context.castStyle,
        fewShotCount: context.fewShotExamples.length,
      },
      success,
      error_message: errorMessage,
      source: params.source,
      instruction: params.instruction ?? null,
      latest_message_id: latestMessage?.id ?? null,
      model: env.AI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .select("id")
    .single();

  if (reqError || !request) {
    logger.error("aiDrafts: request insert failed", { error: reqError?.message });
    return { ok: false, error: "リクエストの記録に失敗しました" };
  }

  if (!success) {
    return { ok: false, error: "AI生成に失敗しました" };
  }

  const { data: insertedDrafts, error: draftError } = await supabase
    .from("ai_drafts")
    .insert(
      parsedDrafts.map((d) => ({ request_id: request.id, type: d.type, body: d.body }))
    )
    .select("id, type, body");

  if (draftError || !insertedDrafts) {
    logger.error("aiDrafts: drafts insert failed", { error: draftError?.message });
    return { ok: false, error: "下書きの保存に失敗しました" };
  }

  return {
    ok: true,
    requestId: request.id,
    drafts: insertedDrafts.map((d) => ({ id: d.id, type: d.type, body: d.body })),
  };
}

/**
 * 新鮮な事前生成済み下書きを取得する。
 * 「そのユーザーの最新メッセージが、生成時点の最新メッセージと一致する」場合のみ返す
 * （新着があれば文脈が古いので使わない）。
 */
export async function getFreshPregeneratedDrafts(
  supabase: SupabaseAdmin,
  endUserId: string
): Promise<{ requestId: string; drafts: GeneratedDraft[] } | null> {
  const [{ data: pregen }, { data: latestMessage }] = await Promise.all([
    supabase
      .from("ai_draft_requests")
      .select("id, latest_message_id")
      .eq("end_user_id", endUserId)
      .eq("source", "pregen")
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id")
      .eq("end_user_id", endUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!pregen || !pregen.latest_message_id) return null;
  if (!latestMessage || latestMessage.id !== pregen.latest_message_id) return null;

  const { data: drafts } = await supabase
    .from("ai_drafts")
    .select("id, type, body")
    .eq("request_id", pregen.id)
    .order("created_at", { ascending: true });

  if (!drafts || drafts.length === 0) return null;

  return {
    requestId: pregen.id,
    drafts: drafts.map((d) => ({ id: d.id, type: d.type, body: d.body })),
  };
}

/**
 * 受信時の事前生成（LINE webhook から after() で呼ばれる）。
 * - 契約中かつ担当メイトが決まっているユーザーのみ
 * - 直近60秒以内に事前生成済みならスキップ（連投バースト抑制）
 * - 1ユーザーあたり1日 AI_PREGEN_DAILY_LIMIT 回まで
 * 失敗しても投げない（webhook の後処理を汚さない）。
 */
export async function pregenerateDraftsForInbound(
  supabase: SupabaseAdmin,
  endUserId: string
): Promise<void> {
  try {
    const env = getServerEnv();
    if (!env.AI_PROVIDER_KEY) return;

    const { data: user } = await supabase
      .from("end_users")
      .select("status, assigned_cast_id")
      .eq("id", endUserId)
      .maybeSingle();

    if (!user?.assigned_cast_id) return;
    if (!["trial", "active", "past_due"].includes(user.status)) return;

    const jstDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const burstWindowStart = new Date(Date.now() - 60_000).toISOString();

    const [{ count: todayCount }, { data: recent }, { count: globalCount }] = await Promise.all([
      supabase
        .from("ai_draft_requests")
        .select("*", { count: "exact", head: true })
        .eq("end_user_id", endUserId)
        .eq("source", "pregen")
        .eq("jst_date", jstDate),
      supabase
        .from("ai_draft_requests")
        .select("id")
        .eq("end_user_id", endUserId)
        .eq("source", "pregen")
        .gte("created_at", burstWindowStart)
        .limit(1)
        .maybeSingle(),
      // 全体の日次上限（事業としてのコスト天井）
      supabase
        .from("ai_draft_requests")
        .select("*", { count: "exact", head: true })
        .eq("source", "pregen")
        .eq("jst_date", jstDate),
    ]);

    if ((todayCount ?? 0) >= env.AI_PREGEN_DAILY_LIMIT) return;
    if (recent) return;
    if ((globalCount ?? 0) >= env.AI_PREGEN_GLOBAL_DAILY_LIMIT) {
      // 上限到達は運用が気づけるようログに残す（手動生成は引き続き可能）
      logger.warn("aiDrafts: global pregeneration daily limit reached", {
        limit: env.AI_PREGEN_GLOBAL_DAILY_LIMIT,
      });
      return;
    }

    const result = await generateDraftsCore(supabase, {
      endUserId,
      castId: user.assigned_cast_id,
      requestedBy: user.assigned_cast_id,
      source: "pregen",
    });

    if (!result.ok) {
      logger.warn("aiDrafts: pregeneration failed", { endUserId, error: result.error });
    }
  } catch (err) {
    logger.warn("aiDrafts: pregeneration crashed", {
      endUserId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
