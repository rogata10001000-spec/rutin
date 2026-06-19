import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import { getPreviousJstMonthRange } from "@/lib/date-jst";

/**
 * 月次精算 自動作成ジョブ（月末締め）
 *
 * 毎月1日 09:00 JST（= 00:00 UTC）に実行を想定。
 * 前月分（JST暦月）の未精算配分を集計し、精算（settlement_batch）を draft で自動作成する。
 *
 * - 計算自体は RPC create_settlement_batch_atomic が担う（手動作成と同一ロジック）
 * - created_by = null（システム作成）
 * - 冪等性: 同一期間の精算が既にあればスキップ
 * - 対象配分が無い月はスキップ（エラーにしない）
 *
 * 作成後の「承認 → 支払い完了」は従来どおり管理者が画面から行う。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { periodFrom, periodTo } = getPreviousJstMonthRange();

  try {
    const supabase = createAdminSupabaseClient();

    // 冪等性: 同一期間の精算が既に存在すればスキップ
    const { data: existing } = await supabase
      .from("settlement_batches")
      .select("id")
      .eq("period_from", periodFrom)
      .eq("period_to", periodTo)
      .maybeSingle();

    if (existing) {
      logger.info("Monthly settlement already exists, skipping", {
        periodFrom,
        periodTo,
        batchId: existing.id,
      });
      return NextResponse.json({
        ok: true,
        skipped: "already_exists",
        batchId: existing.id,
        periodFrom,
        periodTo,
      });
    }

    // 前月分を集計して精算を作成（システム作成 = created_by null）
    const { data: batchId, error } = await supabase.rpc(
      "create_settlement_batch_atomic",
      {
        p_period_from: periodFrom,
        p_period_to: periodTo,
        p_created_by: null,
      }
    );

    // 対象が無い月は正常スキップ
    if (error?.code === "P0002" || error?.message?.includes("NO_SETTLEMENT_TARGETS")) {
      logger.info("Monthly settlement: no targets, skipping", { periodFrom, periodTo });
      return NextResponse.json({ ok: true, skipped: "no_targets", periodFrom, periodTo });
    }

    if (error || !batchId) {
      logger.error("Monthly settlement job failed", { error, periodFrom, periodTo });
      return NextResponse.json({ error: "Job failed" }, { status: 500 });
    }

    const { data: batch } = await supabase
      .from("settlement_batches")
      .select("total_amount_jpy")
      .eq("id", batchId as string)
      .single();

    // 監査ログ（システム実行: actor null）
    await supabase.from("audit_logs").insert({
      actor_staff_id: null,
      action: "SETTLEMENT_BATCH_AUTO_CREATE",
      target_type: "settlement_batches",
      target_id: batchId as string,
      success: true,
      metadata: {
        period_from: periodFrom,
        period_to: periodTo,
        total_amount_jpy: batch?.total_amount_jpy ?? 0,
      } as unknown as Record<string, unknown>,
    });

    logger.info("Monthly settlement created", {
      batchId,
      periodFrom,
      periodTo,
      total: batch?.total_amount_jpy ?? 0,
    });

    return NextResponse.json({
      ok: true,
      batchId,
      periodFrom,
      periodTo,
      total: batch?.total_amount_jpy ?? 0,
    });
  } catch (err) {
    logger.error("Monthly settlement job error", { error: err, periodFrom, periodTo });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
