"use server";

import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { Result } from "../types";
import {
  getCurrentJstMonthRange,
  getLastNMonthsJstRange,
  getPreviousJstMonthRange,
} from "@/lib/date-jst";
import { PLAN_CODES, resolveCastPlanPricing } from "@/lib/plan-pricing";
import type { PlanCode, SubscriptionStatus } from "@/lib/supabase/types";

export type MarketingPeriodPreset = "current_month" | "previous_month" | "last_3_months" | "custom";

export type MarketingPlanBreakdown = {
  planCode: PlanCode;
  count: number;
  ratio: number;
  estimatedMrrJpy: number;
};

export type MarketingCastScorecard = {
  castId: string | null;
  castName: string;
  assignedCount: number;
  activeCount: number;
  trialCount: number;
  canceledCount: number;
  estimatedMrrJpy: number;
  churnRate: number | null;
  closingRate: number | null;
  trialConversionRate: number | null;
  avgLeadTimeDays: number | null;
  planBreakdown: MarketingPlanBreakdown[];
};

export type MarketingSummary = {
  periodFrom: string;
  periodTo: string;
  preset: MarketingPeriodPreset;
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  lineFollows: number;
  subscriptions: number;
  cancellations: number;
  trialStarts: number;
  closingRate: number | null;
  churnRate: number | null;
  trialConversionRate: number | null;
  estimatedMrrJpy: number;
  arpuJpy: number | null;
  ltvApproxJpy: number | null;
  netAdds: number;
  avgLeadTimeDays: number | null;
  planBreakdown: MarketingPlanBreakdown[];
  castScorecards: MarketingCastScorecard[];
};

export type GetMarketingSummaryInput = {
  preset?: MarketingPeriodPreset;
  periodFrom?: string;
  periodTo?: string;
};

export type GetMarketingSummaryResult = Result<MarketingSummary>;

function resolvePeriod(input: GetMarketingSummaryInput): {
  periodFrom: string;
  periodTo: string;
  preset: MarketingPeriodPreset;
} {
  const preset = input.preset ?? "current_month";

  if (preset === "custom" && input.periodFrom && input.periodTo) {
    return { periodFrom: input.periodFrom, periodTo: input.periodTo, preset };
  }
  if (preset === "previous_month") {
    return { ...getPreviousJstMonthRange(), preset };
  }
  if (preset === "last_3_months") {
    return { ...getLastNMonthsJstRange(3), preset };
  }
  return { ...getCurrentJstMonthRange(), preset: "current_month" };
}

const ACTIVE_STATUSES: SubscriptionStatus[] = ["active", "past_due", "paused"];

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function resolvePlanAmount(
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

export async function getMarketingSummary(
  input: GetMarketingSummaryInput = {}
): Promise<GetMarketingSummaryResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const { periodFrom, periodTo, preset } = resolvePeriod(input);
  const supabase = createAdminSupabaseClient();
  const periodStart = `${periodFrom}T00:00:00+09:00`;
  const periodEnd = `${periodTo}T23:59:59+09:00`;

  const [{ data: users, error: usersError }, { data: events, error: eventsError }, { data: staff }] =
    await Promise.all([
      supabase
        .from("end_users")
        .select(
          "id, status, plan_code, assigned_cast_id, line_followed_at, trial_started_at, subscribed_at, canceled_at"
        )
        .neq("status", "incomplete"),
      supabase
        .from("subscription_lifecycle_events")
        .select("end_user_id, cast_id, event_type, plan_code, occurred_at")
        .gte("occurred_at", periodStart)
        .lte("occurred_at", periodEnd),
      supabase.from("staff_profiles").select("id, display_name"),
    ]);

  if (usersError || eventsError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "マーケティングデータの取得に失敗しました" },
    };
  }

  const allUsers = users ?? [];
  const periodEvents = events ?? [];
  const staffNames = new Map((staff ?? []).map((s) => [s.id, s.display_name]));
  const pricingCache = new Map<string, Awaited<ReturnType<typeof resolveCastPlanPricing>>>();

  const lineFollows = periodEvents.filter((e) => e.event_type === "line_follow").length;
  const subscriptions = periodEvents.filter((e) => e.event_type === "subscribe").length;
  const cancellations = periodEvents.filter((e) => e.event_type === "cancel").length;
  const trialStarts = periodEvents.filter((e) => e.event_type === "trial_start").length;

  const activeAtStart = allUsers.filter((user) => {
    const subscribedAt = user.subscribed_at;
    const canceledAt = user.canceled_at;
    return Boolean(subscribedAt && subscribedAt < periodStart && (!canceledAt || canceledAt >= periodStart));
  }).length;

  const leadTimes = allUsers
    .filter((user) => user.line_followed_at && user.subscribed_at)
    .map((user) => {
      const started = new Date(user.line_followed_at as string).getTime();
      const subscribed = new Date(user.subscribed_at as string).getTime();
      return (subscribed - started) / (24 * 60 * 60 * 1000);
    })
    .filter((days) => days >= 0);

  let estimatedMrrJpy = 0;
  const planCount = new Map<PlanCode, { count: number; mrr: number }>();
  const castBuckets = new Map<string, typeof allUsers>();

  for (const user of allUsers) {
    const castKey = user.assigned_cast_id ?? "unassigned";
    castBuckets.set(castKey, [...(castBuckets.get(castKey) ?? []), user]);

    if (ACTIVE_STATUSES.includes(user.status as SubscriptionStatus)) {
      const amount = await resolvePlanAmount(
        supabase,
        pricingCache,
        user.assigned_cast_id,
        user.plan_code
      );
      estimatedMrrJpy += amount;
      const code = PLAN_CODES.includes(user.plan_code as PlanCode)
        ? (user.plan_code as PlanCode)
        : "standard";
      const current = planCount.get(code) ?? { count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += amount;
      planCount.set(code, current);
    }
  }

  const activeUsers = allUsers.filter((user) =>
    ACTIVE_STATUSES.includes(user.status as SubscriptionStatus)
  ).length;
  const trialUsers = allUsers.filter((user) => user.status === "trial").length;
  const churnRate = safeRate(cancellations, activeAtStart);
  const arpuJpy = activeUsers > 0 ? Math.round(estimatedMrrJpy / activeUsers) : null;
  const ltvApproxJpy = arpuJpy && churnRate && churnRate > 0 ? Math.round(arpuJpy / churnRate) : null;

  const planBreakdown: MarketingPlanBreakdown[] = PLAN_CODES.map((planCode) => {
    const entry = planCount.get(planCode) ?? { count: 0, mrr: 0 };
    return {
      planCode,
      count: entry.count,
      ratio: activeUsers > 0 ? entry.count / activeUsers : 0,
      estimatedMrrJpy: entry.mrr,
    };
  });

  const castScorecards: MarketingCastScorecard[] = [];
  for (const [castKey, castUsers] of castBuckets.entries()) {
    const castId = castKey === "unassigned" ? null : castKey;
    const castEvents = periodEvents.filter((event) => (event.cast_id ?? "unassigned") === castKey);
    const castLineFollows = castEvents.filter((event) => event.event_type === "line_follow").length;
    const castSubscriptions = castEvents.filter((event) => event.event_type === "subscribe").length;
    const castCancellations = castEvents.filter((event) => event.event_type === "cancel").length;
    const castTrialStarts = castEvents.filter((event) => event.event_type === "trial_start").length;
    const castActiveUsers = castUsers.filter((user) =>
      ACTIVE_STATUSES.includes(user.status as SubscriptionStatus)
    );
    const castActiveAtStart = castUsers.filter((user) => {
      const subscribedAt = user.subscribed_at;
      const canceledAt = user.canceled_at;
      return Boolean(subscribedAt && subscribedAt < periodStart && (!canceledAt || canceledAt >= periodStart));
    }).length;

    let castMrr = 0;
    const castPlanCount = new Map<PlanCode, { count: number; mrr: number }>();
    for (const user of castActiveUsers) {
      const amount = await resolvePlanAmount(supabase, pricingCache, castId, user.plan_code);
      castMrr += amount;
      const code = PLAN_CODES.includes(user.plan_code as PlanCode)
        ? (user.plan_code as PlanCode)
        : "standard";
      const current = castPlanCount.get(code) ?? { count: 0, mrr: 0 };
      current.count += 1;
      current.mrr += amount;
      castPlanCount.set(code, current);
    }

    const castLeadTimes = castUsers
      .filter((user) => user.line_followed_at && user.subscribed_at)
      .map((user) => {
        const started = new Date(user.line_followed_at as string).getTime();
        const subscribed = new Date(user.subscribed_at as string).getTime();
        return (subscribed - started) / (24 * 60 * 60 * 1000);
      })
      .filter((days) => days >= 0);

    castScorecards.push({
      castId,
      castName: castId ? staffNames.get(castId) ?? "不明" : "未 assigned",
      assignedCount: castUsers.length,
      activeCount: castActiveUsers.length,
      trialCount: castUsers.filter((user) => user.status === "trial").length,
      canceledCount: castCancellations,
      estimatedMrrJpy: castMrr,
      churnRate: safeRate(castCancellations, castActiveAtStart),
      closingRate: safeRate(castSubscriptions, castLineFollows),
      trialConversionRate: safeRate(castSubscriptions, castTrialStarts),
      avgLeadTimeDays: average(castLeadTimes),
      planBreakdown: PLAN_CODES.map((planCode) => {
        const entry = castPlanCount.get(planCode) ?? { count: 0, mrr: 0 };
        return {
          planCode,
          count: entry.count,
          ratio: castActiveUsers.length > 0 ? entry.count / castActiveUsers.length : 0,
          estimatedMrrJpy: entry.mrr,
        };
      }),
    });
  }

  castScorecards.sort((a, b) => b.estimatedMrrJpy - a.estimatedMrrJpy);

  return {
    ok: true,
    data: {
      periodFrom,
      periodTo,
      preset,
      totalUsers: allUsers.length,
      activeUsers,
      trialUsers,
      lineFollows,
      subscriptions,
      cancellations,
      trialStarts,
      closingRate: safeRate(subscriptions, lineFollows),
      churnRate,
      trialConversionRate: safeRate(subscriptions, trialStarts),
      estimatedMrrJpy,
      arpuJpy,
      ltvApproxJpy,
      netAdds: subscriptions - cancellations,
      avgLeadTimeDays: average(leadTimes),
      planBreakdown,
      castScorecards,
    },
  };
}
