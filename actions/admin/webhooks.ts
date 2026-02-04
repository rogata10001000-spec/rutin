"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "../types";

export type WebhookEvent = {
  id: string;
  provider: "line" | "stripe";
  eventId: string;
  eventType: string;
  receivedAt: string;
  processedAt: string | null;
  success: boolean;
  errorMessage: string | null;
};

export type GetWebhookEventsInput = {
  provider?: "line" | "stripe";
  success?: boolean;
  limit?: number;
};

export type GetWebhookEventsResult = Result<{ items: WebhookEvent[]; total: number }>;

/**
 * Webhookイベント一覧取得
 */
export async function getWebhookEvents(
  input: GetWebhookEventsInput = {}
): Promise<GetWebhookEventsResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { provider, success, limit = 100 } = input;

  let query = supabase
    .from("webhook_events")
    .select("id, provider, event_id, event_type, received_at, processed_at, success, error_message", { count: "exact" })
    .order("received_at", { ascending: false })
    .limit(limit);

  if (provider) {
    query = query.eq("provider", provider);
  }
  if (typeof success === "boolean") {
    query = query.eq("success", success);
  }

  const { data: events, error, count } = await query;

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: WebhookEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    provider: e.provider as "line" | "stripe",
    eventId: e.event_id,
    eventType: e.event_type,
    receivedAt: e.received_at,
    processedAt: e.processed_at,
    success: e.success,
    errorMessage: e.error_message,
  }));

  return { ok: true, data: { items, total: count ?? items.length } };
}

export type WebhookStats = {
  totalToday: number;
  successToday: number;
  failedToday: number;
  totalWeek: number;
  successWeek: number;
  failedWeek: number;
};

export type GetWebhookStatsResult = Result<WebhookStats>;

/**
 * Webhook統計取得
 */
export async function getWebhookStats(): Promise<GetWebhookStatsResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 今日のJST開始
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  // 一週間前
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);
  const weekAgoStr = weekAgo.toISOString();

  // 今日の統計
  const { count: totalToday } = await supabase
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", todayStr);

  const { count: successToday } = await supabase
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", todayStr)
    .eq("success", true);

  // 今週の統計
  const { count: totalWeek } = await supabase
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", weekAgoStr);

  const { count: successWeek } = await supabase
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", weekAgoStr)
    .eq("success", true);

  return {
    ok: true,
    data: {
      totalToday: totalToday ?? 0,
      successToday: successToday ?? 0,
      failedToday: (totalToday ?? 0) - (successToday ?? 0),
      totalWeek: totalWeek ?? 0,
      successWeek: successWeek ?? 0,
      failedWeek: (totalWeek ?? 0) - (successWeek ?? 0),
    },
  };
}
