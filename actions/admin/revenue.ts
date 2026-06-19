"use server";

import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Result } from "../types";
import {
  aggregateRevenueSummary,
  type RevenueSummary,
} from "@/lib/revenue-calculations";
import {
  addJstMonths,
  getCurrentJstMonthRange,
  getJstMonthFromDate,
  getJstMonthKey,
  getPreviousJstMonthRange,
  getLastNMonthsJstRange,
} from "@/lib/date-jst";
import { PLAN_CODES, resolveCastPlanPricing } from "@/lib/plan-pricing";
import type { PlanCode, SubscriptionStatus } from "@/lib/supabase/types";

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

export type RevenueForecastMonth = {
  month: string;
  confirmedMrrJpy: number;
  trialProjectedJpy: number;
  cancellationDeductionJpy: number;
  projectedTotalJpy: number;
  activeCount: number;
  trialCount: number;
  cancelingCount: number;
};

export type RevenueForecast = {
  months: RevenueForecastMonth[];
  trialConversionRate: number;
  trialConversionRateSource: "historical" | "default";
  totalConfirmedMrrJpy: number;
  totalTrialProjectedJpy: number;
  totalProjectedJpy: number;
};

export type GetRevenueForecastResult = Result<RevenueForecast>;

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

async function getResolvedPlanAmount(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  cache: Map<string, Awaited<ReturnType<typeof resolveCastPlanPricing>>>,
  castId: string | null,
  planCode: string
): Promise<number> {
  const key = castId ?? "default";
  let pricing = cache.get(key);
  if (!pricing) {
    pricing = await resolveCastPlanPricing(supabase, castId);
    cache.set(key, pricing);
  }
  const code = PLAN_CODES.includes(planCode as PlanCode) ? (planCode as PlanCode) : "standard";
  return pricing[code].amount;
}

async function resolveHistoricalTrialConversionRate(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<{ rate: number; source: "historical" | "default" }> {
  const { periodFrom } = getLastNMonthsJstRange(3);
  const { data } = await supabase
    .from("subscription_lifecycle_events")
    .select("event_type")
    .gte("occurred_at", `${periodFrom}T00:00:00+09:00`);

  const events = data ?? [];
  const trialStarts = events.filter((e) => e.event_type === "trial_start").length;
  const subscribes = events.filter((e) => e.event_type === "subscribe").length;

  // 実績を信用するには十分なトライアル件数が必要。
  // 新規システムや、トライアルが始まったばかりで転換実績が溜まっていない段階では
  // 実績だと 0% になり見込みが消えてしまうため、既定値(0.7)で試算する。
  const MIN_TRIAL_SAMPLE = 5;
  if (trialStarts < MIN_TRIAL_SAMPLE) {
    return { rate: 0.7, source: "default" };
  }

  return {
    rate: Math.min(1, subscribes / trialStarts),
    source: "historical",
  };
}

/**
 * 将来月売上予測（計算のみ。revenue_events には保存しない）
 */
export async function getRevenueForecast(months: number = 6): Promise<GetRevenueForecastResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = createAdminSupabaseClient();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const { year, month } = getJstMonthFromDate(today);
  const monthKeys = Array.from({ length: months }, (_, index) => {
    const target = addJstMonths(year, month, index);
    return `${target.year}-${String(target.month).padStart(2, "0")}`;
  });

  const { rate: trialConversionRate, source: trialConversionRateSource } =
    await resolveHistoricalTrialConversionRate(supabase);

  const { data: users, error } = await supabase
    .from("end_users")
    .select("id, status, plan_code, assigned_cast_id, trial_end_at")
    .neq("status", "incomplete");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ユーザーデータの取得に失敗しました" },
    };
  }

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("end_user_id, cancel_at_period_end, current_period_end, status");

  const subscriptionByUser = new Map(
    (subscriptions ?? []).map((subscription) => [subscription.end_user_id, subscription])
  );
  const pricingCache = new Map<string, Awaited<ReturnType<typeof resolveCastPlanPricing>>>();

  const forecastRows: RevenueForecastMonth[] = monthKeys.map((key) => ({
    month: key,
    confirmedMrrJpy: 0,
    trialProjectedJpy: 0,
    cancellationDeductionJpy: 0,
    projectedTotalJpy: 0,
    activeCount: 0,
    trialCount: 0,
    cancelingCount: 0,
  }));

  for (const user of users ?? []) {
    const status = user.status as SubscriptionStatus;
    const amount = await getResolvedPlanAmount(
      supabase,
      pricingCache,
      user.assigned_cast_id,
      user.plan_code
    );
    const subscription = subscriptionByUser.get(user.id);
    const cancelEndMonth =
      subscription?.cancel_at_period_end && subscription.current_period_end
        ? getJstMonthKey(subscription.current_period_end)
        : null;

    for (const row of forecastRows) {
      const canceledBeforeMonth = cancelEndMonth ? row.month > cancelEndMonth : false;

      if (status === "active" && !canceledBeforeMonth) {
        row.confirmedMrrJpy += amount;
        row.activeCount += 1;
      }

      if (status === "active" && canceledBeforeMonth) {
        row.cancellationDeductionJpy += amount;
        row.cancelingCount += 1;
      }

      if (status === "trial" && user.trial_end_at && getJstMonthKey(user.trial_end_at) === row.month) {
        row.trialProjectedJpy += Math.floor(amount * trialConversionRate);
        row.trialCount += 1;
      }
    }
  }

  for (const row of forecastRows) {
    row.projectedTotalJpy = row.confirmedMrrJpy + row.trialProjectedJpy;
  }

  return {
    ok: true,
    data: {
      months: forecastRows,
      trialConversionRate,
      trialConversionRateSource,
      totalConfirmedMrrJpy: forecastRows[0]?.confirmedMrrJpy ?? 0,
      totalTrialProjectedJpy: forecastRows.reduce((sum, row) => sum + row.trialProjectedJpy, 0),
      totalProjectedJpy: forecastRows.reduce((sum, row) => sum + row.projectedTotalJpy, 0),
    },
  };
}
