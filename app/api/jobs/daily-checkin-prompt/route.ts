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
  // 顧客への自動送信は既定で無効。緒方の明示承認のうえ CHECKIN_PROMPT_ENABLED=true を設定したときだけ動く。
  // （2026-10-14 に承認なしで本番送信された事故の再発防止。vercel.json の cron 登録も外してある）
  if (process.env.CHECKIN_PROMPT_ENABLED !== "true") {
    return NextResponse.json({ ok: false, disabled: true, reason: "CHECKIN_PROMPT_ENABLED is not true" }, { status: 200 });
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
