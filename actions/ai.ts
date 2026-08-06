"use server";

import { aiDraftRequestSchema } from "@/schemas/ai";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { canAccessUser } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { after } from "next/server";
import {
  generateDraftsCore,
  getFreshPregeneratedDrafts,
  type GeneratedDraft,
} from "@/lib/ai-drafts";

export type GenerateAiDraftsInput = {
  endUserId: string;
  /** 任意の指示（「今回の返信に反映してほしいこと」）。単発・一括の両方で使える */
  instruction?: string;
  /** 一括生成からの呼び出しか（記録上の source 区分） */
  bulk?: boolean;
};

export type AiDraft = GeneratedDraft;

export type GenerateAiDraftsResult = Result<{
  requestId: string;
  drafts: AiDraft[];
  /** true = 事前生成済みを即時返却した（新規のAPI呼び出しなし） */
  fromPregenerated: boolean;
}>;

/**
 * 日次上限チェック（ユーザー別 + スタッフ別）。超過していればエラーメッセージを返す。
 * 事前生成(pregen)はどちらの上限にも数えない。
 */
async function checkDailyLimits(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  endUserId: string,
  staffId: string
): Promise<string | null> {
  const env = getServerEnv();
  const jstDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  const [{ count: userCount }, { count: staffCount }] = await Promise.all([
    supabase
      .from("ai_draft_requests")
      .select("*", { count: "exact", head: true })
      .eq("end_user_id", endUserId)
      .eq("jst_date", jstDate)
      .eq("success", true)
      .neq("source", "pregen"),
    supabase
      .from("ai_draft_requests")
      .select("*", { count: "exact", head: true })
      .eq("requested_by", staffId)
      .eq("jst_date", jstDate)
      .eq("success", true)
      .neq("source", "pregen"),
  ]);

  if ((userCount ?? 0) >= env.AI_DRAFT_DAILY_LIMIT) {
    return `このユーザーへの本日の生成上限（${env.AI_DRAFT_DAILY_LIMIT}回）に達しました`;
  }
  if ((staffCount ?? 0) >= env.AI_STAFF_DAILY_LIMIT) {
    return `本日の生成上限（${env.AI_STAFF_DAILY_LIMIT}回）に達しました。明日また利用できます`;
  }
  return null;
}

/**
 * AI返信案生成。
 * - 指示なしで新鮮な事前生成があれば即時返却（待ち時間ゼロ・上限も消費しない）
 * - それ以外は担当メイトのスタイル・実返信例を使って新規生成
 * 権限: Admin/Supervisor/Cast（担当）
 */
export async function generateAiDrafts(
  input: GenerateAiDraftsInput
): Promise<GenerateAiDraftsResult> {
  const parsed = aiDraftRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const access = await canAccessUser(parsed.data.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = createAdminSupabaseClient();
  const instruction = parsed.data.instruction?.trim() || null;

  // 指示なしなら、受信時に作っておいた新鮮な下書きを即時返却（体感ゼロ秒）
  if (!instruction) {
    const pregenerated = await getFreshPregeneratedDrafts(supabase, parsed.data.endUserId);
    if (pregenerated) {
      return {
        ok: true,
        data: { ...pregenerated, drafts: pregenerated.drafts, fromPregenerated: true },
      };
    }
  }

  const limitError = await checkDailyLimits(supabase, parsed.data.endUserId, access.id);
  if (limitError) {
    return { ok: false, error: { code: "CONFLICT", message: limitError } };
  }

  // スタイル・few-shot は担当メイトのもの（操作者が管理者でもメイトの口調で生成する）
  const { data: user } = await supabase
    .from("end_users")
    .select("assigned_cast_id")
    .eq("id", parsed.data.endUserId)
    .maybeSingle();

  const result = await generateDraftsCore(supabase, {
    endUserId: parsed.data.endUserId,
    castId: user?.assigned_cast_id ?? null,
    requestedBy: access.id,
    instruction,
    source: input.bulk ? "bulk" : "manual",
  });

  // 監査ログは応答をブロックしない
  const endUserId = parsed.data.endUserId;
  after(async () => {
    try {
      await writeAuditLog({
        action: "AI_DRAFT_REQUEST",
        targetType: "ai_draft_requests",
        targetId: result.ok ? result.requestId : "failed",
        success: result.ok,
        metadata: buildAuditMetadata({
          end_user_id: endUserId,
          draft_count: result.ok ? result.drafts.length : 0,
          error: result.ok ? null : result.error,
        }),
      });
    } catch (err) {
      logger.error("ai: audit log failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  if (!result.ok) {
    return { ok: false, error: { code: "EXTERNAL_API_ERROR", message: result.error } };
  }

  return {
    ok: true,
    data: { requestId: result.requestId, drafts: result.drafts, fromPregenerated: false },
  };
}

export type PregeneratedDraftsResult = Result<{
  requestId: string;
  drafts: AiDraft[];
} | null>;

/**
 * 新鮮な事前生成済み下書きの有無を確認する（スレッドを開いたときの先読み用）。
 * あればボタンに「準備済み」を出し、クリック時に即表示できる。
 */
export async function getPreGeneratedDrafts(
  endUserId: string
): Promise<PregeneratedDraftsResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = createAdminSupabaseClient();
  const pregenerated = await getFreshPregeneratedDrafts(supabase, endUserId);
  return { ok: true, data: pregenerated };
}

export type BatchDraftItem = {
  endUserId: string;
  ok: boolean;
  requestId?: string;
  drafts?: AiDraft[];
  error?: string;
};

export type GenerateAiDraftsBatchResult = Result<{ items: BatchDraftItem[] }>;

const BATCH_MAX_USERS = 10;
const BATCH_CONCURRENCY = 5;

/**
 * 一括生成用のバッチ（最大10人/回・サーバー内で並列5）。
 * クライアントはこれを10人ずつ順に呼ぶことで、100人でも
 * 「1人ずつ直列」（Server Actionの直列化制約）を回避して大幅に短縮できる。
 * 指示なしで新鮮な事前生成があるユーザーは、それを返して上限もAPIコストも消費しない。
 */
export async function generateAiDraftsBatch(input: {
  endUserIds: string[];
  instruction?: string;
}): Promise<GenerateAiDraftsBatchResult> {
  const endUserIds = [...new Set(input.endUserIds)].slice(0, BATCH_MAX_USERS);
  if (endUserIds.length === 0) {
    return { ok: true, data: { items: [] } };
  }

  const instruction = input.instruction?.trim() || null;
  if (instruction && instruction.length > 200) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "指示は200文字以内で入力してください" },
    };
  }

  // 権限は各ユーザーごとに確認（castは担当のみ）。1件目で全体の認証状態も確定する
  const accessResults = await Promise.all(endUserIds.map((id) => canAccessUser(id)));
  const staffId = accessResults.find((a) => a !== null)?.id;
  if (!staffId) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "対象ユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = createAdminSupabaseClient();

  // 対象の担当メイトをまとめて取得
  const { data: users } = await supabase
    .from("end_users")
    .select("id, assigned_cast_id")
    .in("id", endUserIds);
  const castMap = new Map((users ?? []).map((u) => [u.id, u.assigned_cast_id]));

  const items: BatchDraftItem[] = [];
  const queue = endUserIds.map((endUserId, index) => ({ endUserId, index }));
  const results: BatchDraftItem[] = new Array(endUserIds.length);

  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const { endUserId, index } = next;

      const access = accessResults[index];
      if (!access) {
        results[index] = { endUserId, ok: false, error: "アクセス権限がありません" };
        continue;
      }

      // 指示なしなら事前生成を優先（無料・即時）
      if (!instruction) {
        const pregenerated = await getFreshPregeneratedDrafts(supabase, endUserId);
        if (pregenerated) {
          results[index] = { endUserId, ok: true, ...pregenerated };
          continue;
        }
      }

      const limitError = await checkDailyLimits(supabase, endUserId, access.id);
      if (limitError) {
        results[index] = { endUserId, ok: false, error: limitError };
        continue;
      }

      const result = await generateDraftsCore(supabase, {
        endUserId,
        castId: castMap.get(endUserId) ?? null,
        requestedBy: access.id,
        instruction,
        source: "bulk",
      });

      results[index] = result.ok
        ? { endUserId, ok: true, requestId: result.requestId, drafts: result.drafts }
        : { endUserId, ok: false, error: result.error };
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, endUserIds.length) }, () => worker())
  );

  items.push(...results);

  // 監査ログ（1バッチ1件）
  after(async () => {
    try {
      await writeAuditLog({
        action: "AI_DRAFT_REQUEST",
        targetType: "ai_draft_requests",
        targetId: "batch",
        success: items.some((i) => i.ok),
        metadata: buildAuditMetadata({
          batch_size: items.length,
          succeeded: items.filter((i) => i.ok).length,
          has_instruction: Boolean(instruction),
        }),
      });
    } catch (err) {
      logger.error("ai: batch audit log failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return { ok: true, data: { items } };
}
