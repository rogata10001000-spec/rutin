import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { runLineStepDelivery } from "@/lib/line-step-delivery";
import { logger } from "@/lib/logger";

/**
 * ステップ配信ジョブ（毎時実行を想定）
 * Vercel Cron / 外部スケジューラから Bearer CRON_SECRET 付き GET で呼び出す。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLineStepDelivery();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("line step delivery job failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
