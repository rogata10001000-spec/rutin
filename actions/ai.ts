"use server";

import { aiDraftRequestSchema } from "@/schemas/ai";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessUser, getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

const AI_DAILY_LIMIT = parseInt(process.env.AI_DRAFT_DAILY_LIMIT ?? "3", 10);
const AI_PROVIDER_KEY = process.env.AI_PROVIDER_KEY;

export type GenerateAiDraftsInput = {
  endUserId: string;
};

export type AiDraft = {
  type: "empathy" | "praise" | "suggest";
  body: string;
};

export type GenerateAiDraftsResult = Result<{
  requestId: string;
  drafts: AiDraft[];
}>;

/**
 * AI返信案生成（1日3回制限）
 * 権限: Admin/Supervisor/Cast（担当）
 */
export async function generateAiDrafts(
  input: GenerateAiDraftsInput
): Promise<GenerateAiDraftsResult> {
  // Zodバリデーション
  const parsed = aiDraftRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // 権限チェック
  const access = await canAccessUser(parsed.data.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // JSTで今日の日付
  const jstDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  // 1日の制限チェック
  const { count } = await supabase
    .from("ai_draft_requests")
    .select("*", { count: "exact", head: true })
    .eq("end_user_id", parsed.data.endUserId)
    .eq("jst_date", jstDate)
    .eq("success", true);

  if ((count ?? 0) >= AI_DAILY_LIMIT) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: `本日の生成上限（${AI_DAILY_LIMIT}回）に達しました` },
    };
  }

  // コンテキスト収集
  // 1. 直近20メッセージ
  const { data: messages } = await supabase
    .from("messages")
    .select("direction, body, created_at")
    .eq("end_user_id", parsed.data.endUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  // 2. ピン留めメモ
  const { data: pinnedMemos } = await supabase
    .from("memos")
    .select("category, latest_body")
    .eq("end_user_id", parsed.data.endUserId)
    .eq("pinned", true);

  // 3. 直近7日のチェックイン
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("date, status")
    .eq("end_user_id", parsed.data.endUserId)
    .gte("date", sevenDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: false });

  // 4. キャストスタイル要約
  const { data: castProfile } = await supabase
    .from("staff_profiles")
    .select("style_summary")
    .eq("id", access.id)
    .single();

  const contextSnapshot = {
    messages: messages?.map((m) => ({ direction: m.direction, body: m.body })) ?? [],
    pinnedMemos: pinnedMemos ?? [],
    checkins: checkins ?? [],
    castStyle: castProfile?.style_summary ?? null,
  };

  // AI API呼び出し（Claude Haiku）
  let drafts: AiDraft[] = [];
  let success = true;
  let errorMessage: string | null = null;

  try {
    if (!AI_PROVIDER_KEY) {
      throw new Error("AI_PROVIDER_KEY is not configured");
    }

    // Anthropic API呼び出し
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AI_PROVIDER_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: buildAiPrompt(contextSnapshot),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text ?? "";

    // レスポンスをパース
    drafts = parseAiResponse(content);
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  // ai_draft_requests insert
  const { data: request, error: reqError } = await supabase
    .from("ai_draft_requests")
    .insert({
      end_user_id: parsed.data.endUserId,
      requested_by: access.id,
      jst_date: jstDate,
      context_snapshot: contextSnapshot,
      success,
      error_message: errorMessage,
    })
    .select("id")
    .single();

  if (reqError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "リクエストの記録に失敗しました" },
    };
  }

  // 成功時はai_drafts insert
  if (success && drafts.length > 0) {
    const draftInserts = drafts.map((d) => ({
      request_id: request.id,
      type: d.type,
      body: d.body,
    }));

    await supabase.from("ai_drafts").insert(draftInserts);
  }

  // 監査ログ
  await writeAuditLog({
    action: "AI_DRAFT_REQUEST",
    targetType: "ai_draft_requests",
    targetId: request.id,
    success,
    metadata: buildAuditMetadata({
      end_user_id: parsed.data.endUserId,
      draft_count: drafts.length,
      error: errorMessage,
    }),
  });

  if (!success) {
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "AI生成に失敗しました" },
    };
  }

  return { ok: true, data: { requestId: request.id, drafts } };
}

/**
 * AIプロンプト構築
 */
function buildAiPrompt(context: {
  messages: { direction: string; body: string }[];
  pinnedMemos: { category: string; latest_body: string }[];
  checkins: { date: string; status: string }[];
  castStyle: string | null;
}): string {
  const messageHistory = context.messages
    .reverse()
    .map((m) => `${m.direction === "in" ? "ユーザー" : "キャスト"}: ${m.body}`)
    .join("\n");

  const memos = context.pinnedMemos
    .map((m) => `[${m.category}] ${m.latest_body}`)
    .join("\n");

  const checkinStatus = context.checkins
    .map((c) => `${c.date}: ${c.status}`)
    .join(", ");

  return `あなたは習慣化サポートサービスのキャストとして、ユーザーへの返信案を3つ作成してください。

## キャストのスタイル
${context.castStyle ?? "特に指定なし（自然で親しみやすい口調で）"}

## 会話履歴（直近）
${messageHistory || "（履歴なし）"}

## ピン留めメモ（重要情報）
${memos || "（なし）"}

## 直近7日のチェックイン
${checkinStatus || "（なし）"}

## 出力形式
以下の3パターンで返信案を作成してください。各返信は100文字程度で、Bot感のない人間らしい文章にしてください。

[共感]
（ユーザーの気持ちに寄り添う返信）

[称賛]
（ユーザーの行動や努力を褒める返信）

[提案]
（次のアクションを提案する返信）`;
}

/**
 * AIレスポンスをパース
 */
function parseAiResponse(content: string): AiDraft[] {
  const drafts: AiDraft[] = [];

  const empathyMatch = content.match(/\[共感\]\s*([\s\S]*?)(?=\[称賛\]|\[提案\]|$)/);
  const praiseMatch = content.match(/\[称賛\]\s*([\s\S]*?)(?=\[共感\]|\[提案\]|$)/);
  const suggestMatch = content.match(/\[提案\]\s*([\s\S]*?)(?=\[共感\]|\[称賛\]|$)/);

  if (empathyMatch?.[1]?.trim()) {
    drafts.push({ type: "empathy", body: empathyMatch[1].trim() });
  }
  if (praiseMatch?.[1]?.trim()) {
    drafts.push({ type: "praise", body: praiseMatch[1].trim() });
  }
  if (suggestMatch?.[1]?.trim()) {
    drafts.push({ type: "suggest", body: suggestMatch[1].trim() });
  }

  // パースできなかった場合は全体を共感として使用
  if (drafts.length === 0 && content.trim()) {
    drafts.push({ type: "empathy", body: content.trim().slice(0, 300) });
  }

  return drafts;
}
