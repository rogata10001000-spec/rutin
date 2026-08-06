import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { fetchWithRetry } from "@/lib/http-client";
import { logger } from "@/lib/logger";

// =============================================================
// メイトの返信スタイル要約（staff_profiles.style_summary）の自動生成。
//
// 目的: AI下書きを「そのメイトが書きそうな文章」に近づける。
// 手段: そのメイトが実際に自分の声で送った返信を材料に、AIに口調の特徴を要約させる。
//
// 重要な設計判断:
// - 代理送信（sent_as_proxy）は除外する。他人が代筆した文章を学習すると口調が混ざる
// - 200〜300字の要約に留める（プロンプトに毎回入るため長すぎるとコスト増）
// - 材料が少なすぎる（10件未満）ときは生成しない。少数サンプルの誇張を避ける
// - 生成物は「観察された特徴の記述」であり、メイト本人が編集できる下書きとして扱う
// =============================================================

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

/** 学習に必要な最低サンプル数 */
export const STYLE_MIN_SAMPLES = 10;

/** 学習に使う直近の送信件数 */
const STYLE_SAMPLE_LIMIT = 60;

const STYLE_TIMEOUT_MS = 45_000;

const STYLE_SYSTEM_PROMPT = `あなたは文章の特徴を観察して要約するアシスタントです。
渡された「あるサポート担当者が実際に送ったメッセージ」を読み、その人の文章の特徴を日本語200〜300字で要約してください。

必ず観察して書くこと:
- 語尾・口調（です/ます・親しみやすい崩し方など）
- 絵文字や記号の使い方（種類・頻度・使わないなら「使わない」と書く）
- 1通の長さの傾向（短文中心か、丁寧に長めか）
- 相手への呼びかけ方
- よく使う言い回しや励まし方の型

守ること:
- 特徴の「記述」だけを書く。挨拶・前置き・見出し・箇条書きは書かない
- 個人名や個別の出来事は含めない（他のユーザーへの返信にも使える一般化した記述にする）
- 断定しすぎない（傾向として書く）`;

export type StyleSummaryResult =
  | { ok: true; summary: string; sampleCount: number; error?: undefined }
  | { ok: false; error: string; sampleCount: number; summary?: undefined };

/**
 * 指定メイトの実際の送信履歴からスタイル要約を生成する（DBへの保存は呼び出し側）。
 * 権限チェックは呼び出し側の責務。
 */
export async function generateStyleSummary(
  supabase: SupabaseAdmin,
  castId: string
): Promise<StyleSummaryResult> {
  const env = getServerEnv();
  if (!env.AI_PROVIDER_KEY) {
    return { ok: false, error: "AI機能の設定が未完了です", sampleCount: 0 };
  }

  // 本人が自分の声で送ったテキストのみ（代理送信は除外）
  const { data: sent, error } = await supabase
    .from("messages")
    .select("body")
    .eq("sent_by_staff_id", castId)
    .eq("direction", "out")
    .eq("message_type", "text")
    .eq("sent_as_proxy", false)
    .order("created_at", { ascending: false })
    .limit(STYLE_SAMPLE_LIMIT);

  if (error) {
    logger.error("aiStyle: failed to fetch sent messages", { error: error.message });
    return { ok: false, error: "送信履歴を取得できませんでした", sampleCount: 0 };
  }

  // 定型の相槌・極端に長い文は特徴の観察に向かないため除く
  const samples = (sent ?? [])
    .map((m) => m.body.trim())
    .filter((b) => b.length >= 15 && b.length <= 400);

  if (samples.length < STYLE_MIN_SAMPLES) {
    return {
      ok: false,
      error: `学習に使える送信履歴が${samples.length}件しかありません（${STYLE_MIN_SAMPLES}件以上必要です）。もう少し返信を重ねてからお試しください`,
      sampleCount: samples.length,
    };
  }

  try {
    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.AI_PROVIDER_KEY,
        "anthropic-version": "2023-06-01",
      },
      timeoutMs: STYLE_TIMEOUT_MS,
      retries: 1,
      body: JSON.stringify({
        // 分析用モデルの指定があればそちらを使う（未設定なら通常モデル）
        model: env.AI_MODEL_ANALYSIS ?? env.AI_MODEL,
        max_tokens: 600,
        system: [
          { type: "text", text: STYLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `以下は、あるサポート担当者が実際に送ったメッセージです。\n\n${samples
              .map((s) => `- ${s}`)
              .join("\n")}\n\nこの人の文章の特徴を200〜300字で要約してください。`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    const summary: string = (result.content?.[0]?.text ?? "").trim();

    if (!summary) {
      return { ok: false, error: "要約を生成できませんでした", sampleCount: samples.length };
    }

    // プロンプトへ毎回載るため上限を設ける
    return { ok: true, summary: summary.slice(0, 600), sampleCount: samples.length };
  } catch (err) {
    logger.error("aiStyle: generation failed", {
      castId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      error: "スタイルの自動生成に失敗しました。時間をおいてもう一度お試しください",
      sampleCount: samples.length,
    };
  }
}

/**
 * 週次の自動更新（cron から呼ぶ）。
 * 対象は「担当ユーザーがいて、スタイル未設定または30日以上更新されていない」メイト。
 * 手で編集した直後に上書きしないよう、更新から30日経過を条件にしている。
 */
export async function refreshStaleStyleSummaries(
  supabase: SupabaseAdmin,
  options: { limit?: number } = {}
): Promise<{ processed: number; updated: number; skipped: number }> {
  const limit = options.limit ?? 20;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: casts } = await supabase
    .from("staff_profiles")
    .select("id, style_updated_at")
    .eq("role", "cast")
    .eq("active", true)
    .or(`style_updated_at.is.null,style_updated_at.lt."${thirtyDaysAgo}"`)
    .limit(limit);

  let updated = 0;
  let skipped = 0;

  for (const cast of casts ?? []) {
    const result = await generateStyleSummary(supabase, cast.id);
    if (!result.ok) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({
        style_summary: result.summary,
        style_updated_at: new Date().toISOString(),
      })
      .eq("id", cast.id);

    if (error) {
      logger.error("aiStyle: failed to save summary", { castId: cast.id, error: error.message });
      skipped += 1;
      continue;
    }
    updated += 1;
  }

  return { processed: (casts ?? []).length, updated, skipped };
}
