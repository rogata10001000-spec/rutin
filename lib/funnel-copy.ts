import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  FUNNEL_COPY_DEFS,
  getFunnelCopyDef,
  renderFunnelCopy,
  type FunnelCopyKey,
} from "@/lib/funnel-copy-defs";

/**
 * 申込ファネル文言の解決（サーバー専用）。
 *
 * フォールバック連鎖（plan_prices の resolvePlanPricing と同じ型）:
 *   通常表示:      published_value ?? コード内デフォルト
 *   プレビュー表示: draft_value ?? published_value ?? コード内デフォルト
 *
 * DB行が無くても・DBが落ちていても必ずデフォルトで表示できる
 * （文言システムの障害が申込ファネルを止めることはない）。
 */

export type FunnelCopyValues = Record<string, string>;

type CopyRow = {
  key: string;
  draft_value: string | null;
  published_value: string | null;
};

/**
 * 指定キーの文言を解決して返す。
 * @param preview true のとき下書きを優先（管理画面プレビュー用）
 */
export async function getFunnelCopyValues(
  keys: readonly FunnelCopyKey[],
  options: { preview?: boolean } = {}
): Promise<FunnelCopyValues> {
  const values: FunnelCopyValues = {};
  for (const key of keys) {
    const def = getFunnelCopyDef(key);
    if (def) values[key] = def.defaultValue;
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("funnel_copy")
      .select("key, draft_value, published_value")
      .in("key", keys as string[]);

    if (error) {
      // 文言取得の失敗で申込ファネルを止めない（デフォルトで表示を続ける）
      logger.error("funnelCopy: fetch failed, falling back to defaults", {
        error: error.message,
      });
      return values;
    }

    for (const row of (data ?? []) as CopyRow[]) {
      // null = 未設定（コード内デフォルトを使う） / 空文字 = 意図的に空（その文言を出さない）。
      // 以前は空文字も「未設定」として扱っていたため、
      // 「このバナーを消したい」と空欄にして公開してもデフォルト文言が復活し、
      // 保存は成功して見えるのに消せない、という状態だった。
      // ?? は空文字を残すので、下書きで空にした場合もプレビューに反映される。
      const resolved = options.preview
        ? row.draft_value ?? row.published_value
        : row.published_value;
      if (resolved != null && row.key in values) {
        values[row.key] = resolved;
      }
    }
  } catch (err) {
    logger.error("funnelCopy: unexpected fetch error, falling back to defaults", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return values;
}

/** 全キーを解決する（画面側で必要分だけ渡すのが基本。エディタや一括プレビュー用）。 */
export async function getAllFunnelCopyValues(
  options: { preview?: boolean } = {}
): Promise<FunnelCopyValues> {
  return getFunnelCopyValues(
    FUNNEL_COPY_DEFS.map((d) => d.key),
    options
  );
}

// =====================================================
// webhook ホットパス用の短期キャッシュ付き単キー取得
// =====================================================

type CacheEntry = { value: string; expiresAt: number };
const singleKeyCache = new Map<string, CacheEntry>();
const SINGLE_KEY_CACHE_TTL_MS = 60_000;

/**
 * 公開値を1キーだけ取得する（60秒キャッシュ）。
 * LINE webhook のメッセージ判定（ボタンラベル照合）など、
 * 毎リクエスト走る場所からの利用を想定。
 */
export async function getPublishedFunnelCopy(key: FunnelCopyKey): Promise<string> {
  const cached = singleKeyCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const values = await getFunnelCopyValues([key]);
  const value = values[key] ?? getFunnelCopyDef(key)?.defaultValue ?? "";
  singleKeyCache.set(key, { value, expiresAt: Date.now() + SINGLE_KEY_CACHE_TTL_MS });
  return value;
}

/** 公開処理の直後に呼び、キャッシュの古い値が最大60秒残るのを防ぐ。 */
export function invalidateFunnelCopyCache(): void {
  singleKeyCache.clear();
}

export { renderFunnelCopy };
