import { createServerSupabaseClient } from "./supabase/server";
import { logger } from "./logger";

/**
 * 監査アクション定義（付録A準拠）
 */
export type AuditAction =
  // LINE Webhook
  | "LINE_WEBHOOK_RECEIVED"
  | "LINE_MESSAGE_SAVED"
  | "CHECKIN_RECORDED"
  | "LINE_FOLLOW"
  // メッセージ
  | "SEND_MESSAGE"
  | "PROXY_SEND"
  // 担当
  | "ASSIGN_CAST"
  | "CREATE_SHADOW_DRAFT"
  // メモ
  | "UPSERT_MEMO"
  | "PIN_MEMO"
  | "DELETE_MEMO"
  // 誕生日
  | "BIRTHDAY_SENT"
  // AI
  | "AI_DRAFT_REQUEST"
  // サブスク
  | "SUBSCRIPTION_SYNC"
  | "SUBSCRIPTION_CHECKOUT_CREATE"
  // 価格
  | "UPSERT_CAST_PLAN_PRICE"
  | "CHANGE_SUBSCRIPTION_PRICE"
  // ポイント/ギフト
  | "POINT_CHECKOUT_CREATE"
  | "POINT_PURCHASE_CONFIRMED"
  | "GIFT_SEND"
  | "GIFT_CATALOG_CREATE"
  | "GIFT_CATALOG_UPDATE"
  | "POINT_PRODUCT_CREATE"
  | "POINT_PRODUCT_UPDATE"
  // 配分/精算
  | "UPSERT_PAYOUT_RULE"
  | "DEACTIVATE_PAYOUT_RULE"
  | "SETTLEMENT_BATCH_CREATE"
  | "SETTLEMENT_BATCH_APPROVE"
  | "SETTLEMENT_BATCH_PAID"
  // 返金
  | "REFUND_OR_CHARGEBACK_HANDLED"
  // ユーザー管理
  | "USER_PROFILE_UPDATE"
  | "USER_CREATE"
  // マスタ管理
  | "PLAN_PRICE_CREATE"
  | "PLAN_PRICE_UPDATE"
  | "TAX_RATE_CREATE"
  | "TAX_RATE_UPDATE"
  | "PLAN_SETTINGS_UPDATE"
  // スタッフ管理
  | "STAFF_PROFILE_UPDATE"
  | "CAST_ACCEPTING_TOGGLED"
  | "STAFF_CREATED"
  | "STAFF_INVITE"
  // キャスト写真
  | "CAST_PHOTO_UPLOAD"
  | "CAST_PHOTO_DELETE"
  | "CAST_PHOTO_REORDER"
  // その他
  | "SEARCH_USERS"
  | "GET_USER_DETAIL"
  | "GET_INBOX_ITEMS"
  | "GET_CHAT_THREAD"
  | "SEARCH_AUDIT_LOGS";

/**
 * 監査ログ書き込み
 * 
 * @param action - 実行されたアクション
 * @param targetType - 対象テーブル名
 * @param targetId - 対象レコードID
 * @param success - 成功/失敗
 * @param metadata - 追加情報（before/after, 理由, 計算内訳等）
 * @param actorStaffId - 操作者ID（省略時は現在のユーザー、システム操作時はnull）
 */
export async function writeAuditLog(params: {
  action: AuditAction;
  targetType: string;
  targetId: string;
  success: boolean;
  metadata?: Record<string, unknown>;
  actorStaffId?: string | null;
  required?: boolean;
}): Promise<{ ok: true; id: string; error?: undefined } | { ok: false; id?: undefined; error: string }> {
  try {
    const supabase = await createServerSupabaseClient();

    // actorStaffIdが指定されていない場合は現在のユーザーを取得
    let actorId = params.actorStaffId;
    if (actorId === undefined) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      actorId = user?.id ?? null;
    }

    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        actor_staff_id: actorId,
        action: params.action,
        target_type: params.targetType,
        target_id: params.targetId,
        success: params.success,
        metadata: params.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) {
      logger.error("Audit log write failed", { error: error.message, action: params.action });
      if (params.required) {
        throw new Error(error.message);
      }
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    logger.error("Audit log unexpected error", {
      error: err instanceof Error ? err.message : "unknown",
      action: params.action,
    });
    const message = "Unexpected error writing audit log";
    if (params.required) {
      throw new Error(message);
    }
    return { ok: false, error: message };
  }
}

/**
 * 操作の開始時点でメタデータを構築するヘルパー
 */
export function buildAuditMetadata(
  data: Record<string, unknown>,
  options?: {
    before?: Record<string, unknown>;
    reason?: string;
    calculations?: Record<string, unknown>;
    externalApiResult?: Record<string, unknown>;
  }
): Record<string, unknown> {
  return {
    ...data,
    ...(options?.before && { before: options.before }),
    ...(options?.reason && { reason: options.reason }),
    ...(options?.calculations && { calculations: options.calculations }),
    ...(options?.externalApiResult && { external_api_result: options.externalApiResult }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 重要操作の監査ログラッパー
 * 操作を実行し、成功/失敗に関わらず監査ログを記録
 */
export async function withAuditLog<T>(
  params: {
    action: AuditAction;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
  operation: () => Promise<T>
): Promise<{ data: T; auditId: string } | { error: string }> {
  let success = false;
  let errorMessage: string | undefined;
  let result: T | undefined;

  try {
    result = await operation();
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
    throw err; // エラーを再スロー
  } finally {
    // 常に監査ログを記録（失敗時も）
    const auditResult = await writeAuditLog({
      ...params,
      success,
      metadata: {
        ...params.metadata,
        ...(errorMessage && { error: errorMessage }),
      },
    });

    if (!auditResult.ok) {
      logger.error("Audit log failed in wrapper", { error: auditResult.error, action: params.action });
    }
  }

  return { data: result!, auditId: "" };
}
