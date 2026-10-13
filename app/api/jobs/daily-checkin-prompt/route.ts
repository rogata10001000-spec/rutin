import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDailyCheckinPrompts } from "@/lib/checkin-prompts";
import { logger } from "@/lib/logger";

/**
 * 朝のチェックイン催促ジョブ（毎日 9:00 JST = 0:00 UTC）。
 * Vercel Cron / 外部スケジューラから Bearer CRON_SECRET 付き GET で呼び出す。
 * 多重発火は end_user × 日付の claim で no-op になる。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyCheckinPrompts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("daily checkin prompt job failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
