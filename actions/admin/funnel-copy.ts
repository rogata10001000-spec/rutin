"use server";

import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { invalidateFunnelCopyCache } from "@/lib/funnel-copy";
import {
  FUNNEL_COPY_DEFS,
  getFunnelCopyDef,
  missingRequiredVars,
} from "@/lib/funnel-copy-defs";
import { Result } from "../types";

/** エディタ表示用: キーごとの現在値一式 */
export type FunnelCopyEditorEntry = {
  key: string;
  draftValue: string | null;
  publishedValue: string | null;
};

export type GetFunnelCopyForEditorResult = Result<{
  entries: FunnelCopyEditorEntry[];
}>;

/** 全キーの下書き・公開値を取得（Admin）。デフォルト値はクライアント側の defs が持つ。 */
export async function getFunnelCopyForEditor(): Promise<GetFunnelCopyForEditorResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("funnel_copy")
    .select("key, draft_value, published_value");

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "文言の取得に失敗しました" } };
  }

  const rowMap = new Map((data ?? []).map((r) => [r.key, r]));
  const entries: FunnelCopyEditorEntry[] = FUNNEL_COPY_DEFS.map((def) => {
    const row = rowMap.get(def.key);
    return {
      key: def.key,
      draftValue: row?.draft_value ?? null,
      publishedValue: row?.published_value ?? null,
    };
  });

  return { ok: true, data: { entries } };
}

export type SaveFunnelCopyDraftsInput = {
  /** key → 下書き文言。デフォルトと同値なら null 保存（=下書きなし）にする。 */
  drafts: Record<string, string>;
};

export type SaveFunnelCopyDraftsResult = Result<{ savedCount: number }>;

/** 下書きを保存（Admin）。公開値・エンドユーザー表示には影響しない。 */
export async function saveFunnelCopyDrafts(
  input: SaveFunnelCopyDraftsInput
): Promise<SaveFunnelCopyDraftsResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const entries = Object.entries(input.drafts ?? {});
  if (entries.length === 0) {
    return { ok: true, data: { savedCount: 0 } };
  }

  // 検証: 未知キーの拒否・必須変数の欠落チェック（原因＋対処を具体的に返す）
  for (const [key, value] of entries) {
    const def = getFunnelCopyDef(key);
    if (!def) {
      return { ok: false, error: { code: "ZOD_ERROR", message: "不正な文言キーが含まれています" } };
    }
    if (typeof value !== "string" || value.length > 2000) {
      return {
        ok: false,
        error: { code: "ZOD_ERROR", message: `「${def.label}」は2000文字以内で入力してください` },
      };
    }
    // 空欄は「その文言を出さない」意味になる。押せないボタン・読めない見出しを
    // 作らないよう、消してよいと定義したキー以外は空欄を拒否する。
    if (value.trim() === "" && !def.emptiable) {
      return {
        ok: false,
        error: {
          code: "ZOD_ERROR",
          message: `「${def.label}」は空にできません。元の文言に戻す場合は「初期値に戻す」を使ってください`,
        },
      };
    }
    const missing = missingRequiredVars(def, value);
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: "ZOD_ERROR",
          message: `「${def.label}」には ${missing.map((v) => `{${v}}`).join("・")} を含める必要があります（自動で値が入る部分です）`,
        },
      };
    }
    if (def.fieldType === "number" && !Number.isFinite(Number(value.trim()))) {
      return {
        ok: false,
        error: { code: "ZOD_ERROR", message: `「${def.label}」は数値で入力してください` },
      };
    }
    if (def.fieldType === "plan-select" && !["light", "standard", "premium"].includes(value)) {
      return {
        ok: false,
        error: { code: "ZOD_ERROR", message: `「${def.label}」の値が不正です` },
      };
    }
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const rows = entries.map(([key, value]) => {
    const def = getFunnelCopyDef(key)!;
    // デフォルトと同じ内容の下書きは「下書きなし」として保存する
    // （エディタに意味のない「未公開の変更」バッジが残り続けるのを防ぐ）
    const draft = value === def.defaultValue ? null : value;
    return { key, draft_value: draft, updated_by: admin.id, updated_at: now };
  });

  const { error } = await supabase
    .from("funnel_copy")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    logger.error("funnelCopy: draft save failed", { error: error.message });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "下書きを保存できませんでした。時間をおいてもう一度お試しください" },
    };
  }

  return { ok: true, data: { savedCount: rows.length } };
}

export type PublishFunnelCopyResult = Result<{ publishedCount: number }>;

/** 下書きをまとめて公開する（Admin）。公開後、下書きはクリアされる。 */
export async function publishFunnelCopy(): Promise<PublishFunnelCopyResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const supabase = createAdminSupabaseClient();

  const { data: pending, error: fetchError } = await supabase
    .from("funnel_copy")
    .select("key, draft_value")
    .not("draft_value", "is", null);

  if (fetchError) {
    return { ok: false, error: { code: "UNKNOWN", message: "公開処理に失敗しました" } };
  }
  if (!pending || pending.length === 0) {
    return { ok: true, data: { publishedCount: 0 } };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    pending.map((row) =>
      supabase
        .from("funnel_copy")
        .update({
          published_value: row.draft_value,
          draft_value: null,
          updated_by: admin.id,
          updated_at: now,
        })
        .eq("key", row.key)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logger.error("funnelCopy: publish failed", { error: failed.error.message });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "一部の文言を公開できませんでした。もう一度お試しください" },
    };
  }

  // webhookホットパス用キャッシュを即時無効化（最大60秒の古いボタンラベル判定を防ぐ）
  invalidateFunnelCopyCache();

  const publishedKeys = pending.map((r) => r.key);
  after(async () => {
    try {
      await writeAuditLog({
        action: "FUNNEL_COPY_PUBLISH",
        targetType: "funnel_copy",
        targetId: "bulk",
        success: true,
        metadata: { keys: publishedKeys, count: publishedKeys.length },
        actorStaffId: admin.id,
      });
    } catch (err) {
      logger.error("funnelCopy: publish audit log failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { ok: true, data: { publishedCount: pending.length } };
}

export type ResetFunnelCopyKeyResult = Result<{ key: string }>;

/** 1キーを初期値（コード内デフォルト）へ戻す＝行を削除する（Admin）。 */
export async function resetFunnelCopyKey(key: string): Promise<ResetFunnelCopyKeyResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }
  if (!getFunnelCopyDef(key)) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正な文言キーです" } };
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("funnel_copy").delete().eq("key", key);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "初期値に戻せませんでした" } };
  }

  invalidateFunnelCopyCache();
  return { ok: true, data: { key } };
}
