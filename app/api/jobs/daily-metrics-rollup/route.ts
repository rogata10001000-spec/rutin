import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDailyMetricsRollup } from "@/lib/analytics-rollup";
import { logger } from "@/lib/logger";

/**
 * 日次メトリクス・ロールアップ（毎日1回・JST深夜想定）。
 *
 * ?date=YYYY-MM-DD を付けると指定日を再集計する（バックフィル用）。
 * 前日窓のスナップショット型ジョブは、上流データ（売上等）を後から修復しても
 * 自動では直らない（実例: invoice.paid の欠落バグを修復した際、売上のあった
 * 日の daily_metrics が revenue=0 のまま固まっていた）。
 * upsert (onConflict: metric_date) のため再実行は安全に上書きされる。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dateParam = new URL(request.url).searchParams.get("date");
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "invalid date (YYYY-MM-DD)" }, { status: 400 });
  }
  try {
    const result = await runDailyMetricsRollup(dateParam ?? undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("daily metrics rollup failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
