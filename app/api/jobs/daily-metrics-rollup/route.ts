import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { runDailyMetricsRollup } from "@/lib/analytics-rollup";
import { logger } from "@/lib/logger";

/** 日次メトリクス・ロールアップ（毎日1回・JST深夜想定） */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyMetricsRollup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("daily metrics rollup failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
