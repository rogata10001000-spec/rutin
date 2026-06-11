import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/supabase/types";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export type SubscriptionLifecycleEventType =
  | "line_follow"
  | "trial_start"
  | "subscribe"
  | "plan_change"
  | "cancel_scheduled"
  | "cancel"
  | "resume";

export type RecordLifecycleEventInput = {
  endUserId: string;
  castId?: string | null;
  eventType: SubscriptionLifecycleEventType;
  planCode?: PlanCode | string | null;
  occurredAt?: string | null;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * 契約ライフサイクルイベントを冪等に記録する。
 * Webhook と手動操作の両方から呼ばれるため、重複は source_ref で吸収する。
 */
export async function recordSubscriptionLifecycleEvent(
  supabase: SupabaseAdmin,
  input: RecordLifecycleEventInput
): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  const { error } = await supabase.from("subscription_lifecycle_events").insert({
    end_user_id: input.endUserId,
    cast_id: input.castId ?? null,
    event_type: input.eventType,
    plan_code: input.planCode ?? null,
    occurred_at: occurredAt,
    source_ref_type: input.sourceRefType ?? null,
    source_ref_id: input.sourceRefId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error && error.code !== "23505") {
    logger.warn("subscription lifecycle event insert failed", {
      endUserId: input.endUserId,
      eventType: input.eventType,
      sourceRefType: input.sourceRefType,
      sourceRefId: input.sourceRefId,
      error: error.message,
    });
  }
}
