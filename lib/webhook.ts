import { createAdminSupabaseClient } from "./supabase/server";
import type { WebhookProvider } from "./supabase/types";
import { logger } from "./logger";

/**
 * Webhook冪等性チェック結果
 */
export type IdempotencyResult =
  | { status: "new"; eventRecordId: string }
  | { status: "duplicate" }
  | { status: "error"; message: string };

/**
 * Webhookイベントの冪等性チェック
 * 同じprovider+event_idの組み合わせは1回のみ処理
 * 
 * @returns "new" = 新規イベント（処理可）, "duplicate" = 既存（スキップ）
 */
export async function checkWebhookIdempotency(
  provider: WebhookProvider,
  eventId: string,
  eventType: string
): Promise<IdempotencyResult> {
  // service_roleでRLSをバイパス
  const supabase = createAdminSupabaseClient();

  try {
    // webhook_eventsにINSERT試行（unique制約で重複判定）
    const { data, error } = await supabase
      .from("webhook_events")
      .insert({
        provider,
        event_id: eventId,
        event_type: eventType,
      })
      .select("id")
      .single();

    if (error) {
      // unique_violation (23505) = 重複
      if (error.code === "23505") {
        return { status: "duplicate" };
      }
      logger.error("Webhook idempotency check failed", { provider, eventId, error: error.message });
      return { status: "error", message: error.message };
    }

    return { status: "new", eventRecordId: data.id };
  } catch (err) {
    logger.error("Webhook unexpected error", {
      provider,
      eventId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { status: "error", message: "Unexpected error" };
  }
}

/**
 * Webhook処理完了をマーク
 */
export async function markWebhookProcessed(
  eventRecordId: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  await supabase
    .from("webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      success,
      error_message: errorMessage ?? null,
    })
    .eq("id", eventRecordId);
}

/**
 * Webhook処理のラッパー（冪等性 + エラーハンドリング）
 */
export async function withWebhookIdempotency<T>(
  provider: WebhookProvider,
  eventId: string,
  eventType: string,
  processor: () => Promise<T>
): Promise<
  | { status: "processed"; data: T }
  | { status: "duplicate" }
  | { status: "error"; message: string }
> {
  // 冪等性チェック
  const idempotencyResult = await checkWebhookIdempotency(provider, eventId, eventType);

  if (idempotencyResult.status === "duplicate") {
    return { status: "duplicate" };
  }

  if (idempotencyResult.status === "error") {
    return { status: "error", message: idempotencyResult.message };
  }

  const eventRecordId = idempotencyResult.eventRecordId;

  try {
    // メイン処理実行
    const result = await processor();

    // 成功マーク
    await markWebhookProcessed(eventRecordId, true);

    return { status: "processed", data: result };
  } catch (err) {
    // 失敗マーク
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await markWebhookProcessed(eventRecordId, false, errorMessage);

    return { status: "error", message: errorMessage };
  }
}
