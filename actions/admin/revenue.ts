"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Result } from "../types";
import {
  aggregateRevenueSummary,
  type RevenueSummary,
} from "@/lib/revenue-calculations";
import {
  getCurrentJstMonthRange,
  getPreviousJstMonthRange,
  getLastNMonthsJstRange,
} from "@/lib/date-jst";

export type RevenuePeriodPreset = "current_month" | "previous_month" | "last_3_months" | "custom";

export type GetRevenueSummaryInput = {
  preset?: RevenuePeriodPreset;
  periodFrom?: string;
  periodTo?: string;
};

export type GetRevenueSummaryResult = Result<{
  summary: RevenueSummary;
  periodFrom: string;
  periodTo: string;
  preset: RevenuePeriodPreset;
}>;

function resolvePeriod(input: GetRevenueSummaryInput): {
  periodFrom: string;
  periodTo: string;
  preset: RevenuePeriodPreset;
} {
  const preset = input.preset ?? "current_month";

  if (preset === "custom" && input.periodFrom && input.periodTo) {
    return { periodFrom: input.periodFrom, periodTo: input.periodTo, preset };
  }

  if (preset === "previous_month") {
    const range = getPreviousJstMonthRange();
    return { ...range, preset };
  }

  if (preset === "last_3_months") {
    const range = getLastNMonthsJstRange(3);
    return { ...range, preset };
  }

  const range = getCurrentJstMonthRange();
  return { ...range, preset: "current_month" };
}

/**
 * 売上サマリー取得（admin専用）
 */
export async function getRevenueSummary(
  input: GetRevenueSummaryInput = {}
): Promise<GetRevenueSummaryResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const { periodFrom, periodTo, preset } = resolvePeriod(input);
  const supabase = await createServerSupabaseClient();

  const { data: revenueEvents, error: revenueError } = await supabase
    .from("revenue_events")
    .select("id, event_type, cast_id, amount_excl_tax_jpy, amount_incl_tax_jpy")
    .in("event_type", ["subscription_monthly", "gift_redeem"])
    .gte("occurred_on", periodFrom)
    .lte("occurred_on", periodTo);

  if (revenueError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "売上データの取得に失敗しました" },
    };
  }

  const events = revenueEvents ?? [];
  const eventIds = events.map((e) => e.id);

  let payouts: { revenue_event_id: string; cast_id: string; amount_jpy: number }[] = [];

  if (eventIds.length > 0) {
    const { data: payoutData, error: payoutError } = await supabase
      .from("payout_calculations")
      .select("revenue_event_id, cast_id, amount_jpy")
      .in("revenue_event_id", eventIds);

    if (payoutError) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "配分データの取得に失敗しました" },
      };
    }

    payouts = payoutData ?? [];
  }

  const castIds = [...new Set(payouts.map((p) => p.cast_id))];
  const castNames: Record<string, string> = {};

  if (castIds.length > 0) {
    const { data: staffData } = await supabase
      .from("staff_profiles")
      .select("id, display_name")
      .in("id", castIds);

    for (const staff of staffData ?? []) {
      castNames[staff.id] = staff.display_name;
    }
  }

  const summary = aggregateRevenueSummary(
    events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      castId: e.cast_id,
      amountExclTaxJpy: e.amount_excl_tax_jpy,
      amountInclTaxJpy: e.amount_incl_tax_jpy,
    })),
    payouts.map((p) => ({
      revenueEventId: p.revenue_event_id,
      castId: p.cast_id,
      amountJpy: p.amount_jpy,
    })),
    castNames
  );

  return {
    ok: true,
    data: { summary, periodFrom, periodTo, preset },
  };
}
