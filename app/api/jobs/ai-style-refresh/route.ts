import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { refreshStaleStyleSummaries } from "@/lib/ai-style";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * メイトの返信スタイル要約の週次自動更新。
 * 週1回の実行を想定（vercel.json のスケジュール参照）。
 *
 * 対象は「スタイル未設定、または30日以上更新されていない」在籍中のメイト。
 * 手で編集した直後に上書きしないよう30日の猶予を置いている。
 * 1回の実行は最大20人まで（AIコストとジョブ時間の上限）。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const result = await refreshStaleStyleSummaries(supabase, { limit: 20 });

    await writeAuditLog({
      action: "AI_STYLE_REFRESH_JOB",
      targetType: "staff_profiles",
      targetId: "batch",
      success: true,
      metadata: result,
      actorStaffId: null,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("ai-style-refresh job failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
