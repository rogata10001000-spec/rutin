import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

const MAX_SOURCE_LEN = 64;
const MAX_URL_LEN = 512;

/**
 * 流入元(src)を正規化する。英数・一部記号のみ・長さ制限。
 * 不正・空なら null（＝記録しない）。任意入力なので厳しめにサニタイズする。
 */
export function sanitizeAcquisitionSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_SOURCE_LEN);
  if (!trimmed) return null;
  // 半角英数と . _ - : / のみ許可（UTM風の値・スラッグを想定）。
  if (!/^[A-Za-z0-9._:/-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_URL_LEN);
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/**
 * follow より前に捕捉した流入元を line_user_id に紐付けて保留する（first-touch）。
 * 既に保留があれば上書きしない。既に end_user が存在すれば即確定も試みる。
 */
export async function recordAcquisitionClick(
  supabase: SupabaseAdmin,
  params: { lineUserId: string; source: string; landingUrl?: unknown; referrer?: unknown }
): Promise<void> {
  const { error } = await supabase
    .from("line_acquisition_attributions")
    .upsert(
      {
        line_user_id: params.lineUserId,
        source: params.source,
        landing_url: sanitizeUrl(params.landingUrl),
        referrer: sanitizeUrl(params.referrer),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "line_user_id", ignoreDuplicates: true }
    );

  if (error) {
    logger.warn("recordAcquisitionClick failed", {
      lineUserId: params.lineUserId,
      error: error.message,
    });
    return;
  }

  // 既に follow 済み（end_user 存在）なら、その場で確定（first-touch）。
  await applyAcquisitionToEndUser(supabase, params.lineUserId);
}

/**
 * 保留中の流入元を end_users.acquisition_source へ first-touch で確定する。
 * acquisition_source が未設定の行にのみ書き込む（最初の流入を優先）。
 * follow ハンドラと記録エンドポイントの双方から呼ぶ（順序非依存）。
 */
export async function applyAcquisitionToEndUser(
  supabase: SupabaseAdmin,
  lineUserId: string,
  endUserId?: string
): Promise<void> {
  try {
    const { data: attr } = await supabase
      .from("line_acquisition_attributions")
      .select("source")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (!attr?.source) return;

    let query = supabase
      .from("end_users")
      .update({
        acquisition_source: attr.source,
        acquisition_recorded_at: new Date().toISOString(),
      })
      .is("acquisition_source", null);

    query = endUserId
      ? query.eq("id", endUserId)
      : query.eq("line_user_id", lineUserId);

    await query;
  } catch (err) {
    logger.warn("applyAcquisitionToEndUser failed", {
      lineUserId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
