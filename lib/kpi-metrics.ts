import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { PLAN_CODES, resolveCastPlanPricing, resolvePlanPricing } from "@/lib/plan-pricing";
import type { PlanCode } from "@/lib/supabase/types";
import {
  KPI_COST_ASSUMPTIONS,
  KPI_TARGETS,
  evaluateKpi,
  formatKpiTarget,
  type KpiStatus,
  type KpiTier,
  type KpiUnit,
} from "@/lib/kpi-targets";
import * as calc from "@/lib/kpi-calculations";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

export type KpiMetric = {
  key: string;
  tier: KpiTier;
  label: string;
  unit: KpiUnit;
  value: number | null;
  status: KpiStatus;
  targetLabel: string;
  /** 分母（表示用。null = 分母の概念がない） */
  sampleSize: number | null;
  /** 値の補足（「32人中 11人」等）。説明文ではなく内訳 */
  detail: string | null;
};

export type KpiStaffRow = {
  staffId: string;
  name: string;
  role: string;
  assignedPaying: number;
  replies: number;
  repliesPerDay: number;
  handlingSamples: number;
  handlingMedianSeconds: number | null;
  handlingHoursPerDay: number | null;
};

export type KpiSnapshot = {
  generatedAt: string;
  metrics: KpiMetric[];
  staff: KpiStaffRow[];
  cancelReasons: { code: string; count: number }[];
  costBreakdown: {
    mrrInclTaxJpy: number;
    mrrExclTaxJpy: number;
    payoutJpy: number;
    stripeFeeJpy: number;
    lineCostJpy: number;
    grossMarginJpy: number;
  };
  /** 取得できなかった項目（画面では「データ不足」になる） */
  warnings: string[];
};

/** PostgREST の既定 1000 行切断を避ける全件取得 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
  pageSize = 1000,
  maxPages = 30
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function buildKpiSnapshot(supabase: SupabaseAdmin, now = new Date()): Promise<KpiSnapshot> {
  const warnings: string[] = [];
  const todayJst = calc.jstDateKey(now);
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS).toISOString();
  const d7 = iso(7);
  const d30 = iso(30);
  const d31Date = calc.jstDateKey(new Date(now.getTime() - 31 * DAY_MS));
  const d30Date = calc.jstDateKey(new Date(now.getTime() - 30 * DAY_MS));
  const d60 = iso(60);

  // ---- 取得（互いに独立なものは並列） ----
  const [
    users,
    staffRes,
    subsRes,
    rulesRes,
    dailyRes,
    slaRes,
    inbound7d,
    checkinsRes,
    aiReqRes,
    lifecycleRes,
  ] = await Promise.all([
    fetchAll<{
      id: string;
      status: string;
      plan_code: string;
      assigned_cast_id: string | null;
      trial_started_at: string | null;
      trial_end_at: string | null;
      subscribed_at: string | null;
      canceled_at: string | null;
    }>(
      (from, to) =>
        supabase
          .from("end_users")
          .select(
            "id, status, plan_code, assigned_cast_id, trial_started_at, trial_end_at, subscribed_at, canceled_at"
          )
          .or("status.neq.incomplete,trial_started_at.not.is.null")
          .order("id")
          .range(from, to),
      "end_users"
    ),
    supabase.from("staff_profiles").select("id, display_name, role"),
    supabase
      .from("subscriptions")
      .select("end_user_id, billing_interval")
      .in("status", [...calc.KPI_LIVE_STATUSES]),
    supabase
      .from("payout_rules")
      .select("scope_type, cast_id, plan_code, percent, effective_from, effective_to")
      .eq("rule_type", "subscription_share")
      .eq("active", true),
    supabase
      .from("daily_metrics")
      .select("metric_date, cancel, active_users")
      .gte("metric_date", d31Date)
      .order("metric_date", { ascending: true }),
    supabase.from("response_metrics").select("sla_breached").gte("created_at", d7),
    fetchAll<{ end_user_id: string; created_at: string }>(
      (from, to) =>
        supabase
          .from("messages")
          .select("end_user_id, created_at")
          .eq("direction", "in")
          .gte("created_at", d7)
          .order("created_at")
          .range(from, to),
      "messages(in)"
    ),
    supabase.from("checkins").select("end_user_id, date, status").gte("date", d30Date),
    supabase.from("ai_draft_requests").select("id, success").gte("created_at", d7),
    supabase
      .from("subscription_lifecycle_events")
      .select("event_type, metadata")
      .gte("occurred_at", d30)
      .in("event_type", ["cancel", "cancel_scheduled"]),
  ]);

  for (const [label, res] of [
    ["staff_profiles", staffRes],
    ["subscriptions", subsRes],
    ["payout_rules", rulesRes],
    ["daily_metrics", dailyRes],
    ["response_metrics", slaRes],
    ["checkins", checkinsRes],
    ["ai_draft_requests", aiReqRes],
    ["subscription_lifecycle_events", lifecycleRes],
  ] as const) {
    if (res.error) warnings.push(`${label} の取得に失敗: ${res.error.message}`);
  }

  // 送信メッセージ（handling_seconds はマイグレーション未適用でも落ちないよう段階的に取得）
  let outbound: calc.OutboundMessageLite[] = [];
  let handlingAvailable = true;
  try {
    const rows = await fetchAll<{
      sent_by_staff_id: string | null;
      created_at: string;
      handling_seconds: number | null;
    }>(
      (from, to) =>
        supabase
          .from("messages")
          .select("sent_by_staff_id, created_at, handling_seconds")
          .eq("direction", "out")
          .gte("created_at", d7)
          .order("created_at")
          .range(from, to),
      "messages(out)"
    );
    outbound = rows.map((r) => ({
      staffId: r.sent_by_staff_id,
      createdAt: r.created_at,
      handlingSeconds: r.handling_seconds,
    }));
  } catch (err) {
    handlingAvailable = false;
    warnings.push("返信の実作業時間（handling_seconds）が未適用のため、件数のみ集計");
    logger.warn("kpi: handling_seconds unavailable, falling back", {
      error: err instanceof Error ? err.message : "unknown",
    });
    const rows = await fetchAll<{ sent_by_staff_id: string | null; created_at: string }>(
      (from, to) =>
        supabase
          .from("messages")
          .select("sent_by_staff_id, created_at")
          .eq("direction", "out")
          .gte("created_at", d7)
          .order("created_at")
          .range(from, to),
      "messages(out)"
    );
    outbound = rows.map((r) => ({
      staffId: r.sent_by_staff_id,
      createdAt: r.created_at,
      handlingSeconds: null,
    }));
  }

  const staff = staffRes.data ?? [];
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const ownerIds = new Set(staff.filter((s) => s.role === "admin").map((s) => s.id));
  const intervalByUser = new Map((subsRes.data ?? []).map((s) => [s.end_user_id, s.billing_interval]));
  const rules = (rulesRes.data ?? []) as calc.PayoutRuleLite[];

  // ---- P0: 契約・MRR・配分 ----
  const paying = users.filter((u) => (calc.KPI_PAYING_STATUSES as readonly string[]).includes(u.status));
  const pricingCache = new Map<string, Promise<Record<PlanCode, { amount: number }>>>();
  const priceFor = async (castId: string | null, interval: "month" | "year") => {
    const key = `${castId ?? "default"}:${interval}`;
    let p = pricingCache.get(key);
    if (!p) {
      p =
        interval === "year"
          ? resolvePlanPricing(supabase, castId, "year")
          : resolveCastPlanPricing(supabase, castId);
      pricingCache.set(key, p);
    }
    return p;
  };

  let mrr = 0;
  let payoutJpy = 0;
  let ownerAssigned = 0;
  const assignedPayingByStaff = new Map<string, number>();
  for (const u of paying) {
    const code = PLAN_CODES.includes(u.plan_code as PlanCode) ? (u.plan_code as PlanCode) : "standard";
    const interval = intervalByUser.get(u.id) === "year" ? "year" : "month";
    let amount = 0;
    try {
      const pricing = await priceFor(u.assigned_cast_id, interval);
      amount = interval === "year" ? pricing[code].amount / 12 : pricing[code].amount;
    } catch (err) {
      warnings.push(`価格解決に失敗（cast=${u.assigned_cast_id ?? "default"}）`);
      logger.warn("kpi: price resolution failed", {
        castId: u.assigned_cast_id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
    mrr += amount;
    const isOwner = u.assigned_cast_id !== null && ownerIds.has(u.assigned_cast_id);
    if (isOwner) ownerAssigned += 1;
    if (u.assigned_cast_id) {
      assignedPayingByStaff.set(
        u.assigned_cast_id,
        (assignedPayingByStaff.get(u.assigned_cast_id) ?? 0) + 1
      );
    }
    const pct = calc.resolvePayoutPercent(rules, u.assigned_cast_id, code, todayJst, isOwner);
    payoutJpy += (amount / (1 + KPI_COST_ASSUMPTIONS.taxRate)) * (pct / 100);
  }
  mrr = Math.round(mrr);
  const margin = calc.estimateGrossMargin({
    mrrInclTaxJpy: mrr,
    payoutJpy,
    payingCount: paying.length,
    assumptions: KPI_COST_ASSUMPTIONS,
  });

  const conversion = calc.trialConversion(
    users.map((u) => ({
      trialStartedAt: u.trial_started_at,
      trialEndAt: u.trial_end_at,
      subscribedAt: u.subscribed_at,
      status: u.status,
    })),
    now
  );
  const retention = calc.retention30d(
    users.map((u) => ({ subscribedAt: u.subscribed_at, canceledAt: u.canceled_at })),
    now
  );

  // 月次解約率: 日次集計があればそれを正、無ければライフサイクルイベントで代用
  const daily = dailyRes.data ?? [];
  const cancelsFromDaily = daily
    .filter((d) => d.metric_date > d30Date)
    .reduce((sum, d) => sum + (d.cancel ?? 0), 0);
  const startRow = daily.find((d) => d.metric_date <= d30Date && d.metric_date >= d31Date);
  const lifecycle = lifecycleRes.data ?? [];
  const cancelEvents = lifecycle.filter((e) => e.event_type === "cancel").length;
  const cancels = daily.length > 0 ? cancelsFromDaily : cancelEvents;
  const payingAtStart = startRow?.active_users ?? paying.length + cancels;
  const churn = calc.monthlyChurn(cancels, payingAtStart);

  // ---- P1 ----
  const workload = calc.staffWorkload(outbound, 7);
  const handlingAll = outbound
    .map((m) => m.handlingSeconds)
    .filter((s): s is number => s !== null);
  const handlingMedian = handlingAvailable ? calc.median(handlingAll) : null;
  const handlingHoursPerDay =
    handlingAvailable && handlingAll.length > 0
      ? handlingAll.reduce((a, b) => a + b, 0) / 7 / 3600
      : null;
  const repliesPerDay = outbound.filter((m) => m.staffId).length / 7;

  let aiDrafts: calc.AiDraftLite[] = [];
  const aiRequests = (aiReqRes.data ?? []) as calc.AiDraftRequestLite[];
  if (aiRequests.length > 0) {
    const ids = aiRequests.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("ai_drafts")
        .select("request_id, selected_at, body, sent_body")
        .in("request_id", ids.slice(i, i + 200));
      if (error) {
        warnings.push(`ai_drafts の取得に失敗: ${error.message}`);
        break;
      }
      aiDrafts.push(
        ...(data ?? []).map((d) => ({
          requestId: d.request_id,
          selectedAt: d.selected_at,
          body: d.body,
          sentBody: d.sent_body,
        }))
      );
    }
  }
  const adoption = calc.aiAdoption(aiRequests, aiDrafts);

  const slaRows = slaRes.data ?? [];
  const slaOk = slaRows.filter((r) => !r.sla_breached).length;
  const slaCompliance = calc.safeRate(slaOk, slaRows.length);

  // ---- P2 ----
  const checkins = checkinsRes.data ?? [];
  const reportEvents7d: calc.ReportEvent[] = [
    ...inbound7d.map((m) => ({ endUserId: m.end_user_id, occurredAt: m.created_at })),
    ...checkins.map((c) => ({ endUserId: c.end_user_id, occurredAt: `${c.date}T12:00:00+09:00` })),
  ];
  const reportDays = calc.reportDaysPerWeek(
    reportEvents7d,
    paying.map((u) => u.id),
    now
  );
  const circle = checkins.filter((c) => c.status === "circle").length;
  const circleRate = calc.safeRate(circle, checkins.length);

  // トライアル初回報告: 直近60日にトライアル開始した人の最初の受信/チェックイン
  const trialCohort = users
    .filter((u) => u.trial_started_at && u.trial_started_at >= d60)
    .slice(0, 150)
    .map((u) => ({ endUserId: u.id, trialStartedAt: u.trial_started_at as string }));
  const firstEvents: calc.ReportEvent[] = [];
  await Promise.all(
    trialCohort.map(async (t) => {
      const [{ data: msg }, { data: ck }] = await Promise.all([
        supabase
          .from("messages")
          .select("created_at")
          .eq("end_user_id", t.endUserId)
          .eq("direction", "in")
          .gte("created_at", t.trialStartedAt)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("checkins")
          .select("date")
          .eq("end_user_id", t.endUserId)
          .gte("date", calc.jstDateKey(t.trialStartedAt))
          .order("date", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (msg?.created_at) firstEvents.push({ endUserId: t.endUserId, occurredAt: msg.created_at });
      if (ck?.date) firstEvents.push({ endUserId: t.endUserId, occurredAt: `${ck.date}T12:00:00+09:00` });
    })
  );
  const firstReport = calc.firstReportRate(trialCohort, firstEvents, now);

  const cancelReasons = calc.cancelReasonBreakdown(
    lifecycle
      .filter((e) => e.event_type === "cancel_scheduled")
      .map((e) => (e.metadata as Record<string, unknown> | null)?.cancel_reason_code as string | undefined)
  );

  // ---- 組み立て ----
  const values: Record<string, { value: number | null; sample: number | null; detail: string | null }> = {
    paying_count: { value: paying.length, sample: null, detail: `トライアル中 ${users.filter((u) => u.status === "trial").length}人` },
    mrr: { value: mrr, sample: null, detail: `税抜 ¥${margin.mrrExclTaxJpy.toLocaleString("ja-JP")}` },
    arpu: { value: paying.length > 0 ? mrr / paying.length : null, sample: paying.length, detail: null },
    gross_margin: {
      value: margin.grossMarginJpy,
      sample: null,
      detail: `配分 ¥${Math.round(payoutJpy).toLocaleString("ja-JP")} ／ 決済 ¥${margin.stripeFeeJpy.toLocaleString("ja-JP")} ／ LINE ¥${margin.lineCostJpy.toLocaleString("ja-JP")}`,
    },
    owner_assigned: { value: ownerAssigned, sample: null, detail: `メイト担当 ${paying.length - ownerAssigned}人` },
    trial_conversion: { value: conversion.rate, sample: conversion.total, detail: `${conversion.total}人中 ${conversion.converted}人（60日）` },
    retention_30d: { value: retention.rate, sample: retention.total, detail: `${retention.total}人中 ${retention.retained}人` },
    monthly_churn: { value: churn, sample: payingAtStart, detail: `30日で ${cancels}件 ／ 期首 ${payingAtStart}人` },
    handling_median_seconds: { value: handlingMedian, sample: handlingAll.length, detail: `計測 ${handlingAll.length}件` },
    replies_per_day: { value: repliesPerDay, sample: null, detail: `7日で ${outbound.filter((m) => m.staffId).length}件` },
    handling_hours_per_day: { value: handlingHoursPerDay, sample: handlingAll.length, detail: null },
    ai_adoption: {
      value: adoption.rate,
      sample: adoption.requests,
      detail: `${adoption.requests}件中 採用 ${adoption.adopted}（そのまま ${adoption.unedited}・編集 ${adoption.edited}）`,
    },
    sla_compliance: { value: slaCompliance, sample: slaRows.length, detail: `${slaRows.length}件中 ${slaOk}件` },
    first_report_rate: { value: firstReport.rate, sample: firstReport.total, detail: `${firstReport.total}人中 ${firstReport.reported}人` },
    report_days_per_week: { value: reportDays.average, sample: reportDays.users, detail: `有料 ${reportDays.users}人` },
    checkin_circle_rate: { value: circleRate, sample: checkins.length, detail: `${checkins.length}件中 ◯ ${circle}件` },
  };

  const metrics: KpiMetric[] = KPI_TARGETS.map((def) => {
    const v = values[def.key] ?? { value: null, sample: null, detail: null };
    return {
      key: def.key,
      tier: def.tier,
      label: def.label,
      unit: def.unit,
      value: v.value,
      status: evaluateKpi(def, v.value, v.sample),
      targetLabel: formatKpiTarget(def),
      sampleSize: v.sample,
      detail: v.detail,
    };
  });

  const staffRows: KpiStaffRow[] = staff
    .filter((s) => s.role === "admin" || s.role === "cast")
    .map((s) => {
      const w = workload.find((x) => x.staffId === s.id);
      return {
        staffId: s.id,
        name: s.display_name,
        role: s.role,
        assignedPaying: assignedPayingByStaff.get(s.id) ?? 0,
        replies: w?.replies ?? 0,
        repliesPerDay: w?.repliesPerDay ?? 0,
        handlingSamples: w?.handlingSamples ?? 0,
        handlingMedianSeconds: w?.handlingMedianSeconds ?? null,
        handlingHoursPerDay: w?.handlingHoursPerDay ?? null,
      };
    })
    .sort((a, b) => b.assignedPaying - a.assignedPaying || b.replies - a.replies);

  return {
    generatedAt: now.toISOString(),
    metrics,
    staff: staffRows,
    cancelReasons,
    costBreakdown: {
      mrrInclTaxJpy: mrr,
      mrrExclTaxJpy: margin.mrrExclTaxJpy,
      payoutJpy: Math.round(payoutJpy),
      stripeFeeJpy: margin.stripeFeeJpy,
      lineCostJpy: margin.lineCostJpy,
      grossMarginJpy: margin.grossMarginJpy,
    },
    warnings,
  };
}
