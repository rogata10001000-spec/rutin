/**
 * KPI の純粋計算（DB・環境に依存しない）。
 * 取得は lib/kpi-metrics.ts、目標・判定は lib/kpi-targets.ts。
 * 分母の定義は docs/SOLO_SCALE_REQUIREMENTS.md §2-2 と一致させる。
 */

export const KPI_LIVE_STATUSES = ["active", "past_due", "paused"] as const;
export const KPI_PAYING_STATUSES = ["active", "past_due"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function safeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** ISO 日時 → JST の YYYY-MM-DD */
export function jstDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(d);
}

// ---------------------------------------------------------------------------
// P0
// ---------------------------------------------------------------------------

export type TrialConversionRow = {
  trialStartedAt: string | null;
  trialEndAt: string | null;
  subscribedAt: string | null;
  status: string;
};

/**
 * トライアル→有料転換率。
 * 分母: 直近 windowDays にトライアルを開始し、トライアル終了日を過ぎた人。
 * 分子: そのうち有料開始（subscribed_at）した人、または現在ライブ契約の人。
 * トライアル中の人は分母に入れない（まだ結果が出ていない）。
 */
export function trialConversion(
  rows: TrialConversionRow[],
  now: Date,
  windowDays = 60
): { converted: number; total: number; rate: number | null } {
  const from = now.getTime() - windowDays * DAY_MS;
  let total = 0;
  let converted = 0;
  for (const r of rows) {
    if (!r.trialStartedAt) continue;
    const started = new Date(r.trialStartedAt).getTime();
    if (started < from || started > now.getTime()) continue;
    const ended = r.trialEndAt ? new Date(r.trialEndAt).getTime() <= now.getTime() : false;
    const isLive = (KPI_LIVE_STATUSES as readonly string[]).includes(r.status);
    const subscribedAfterTrial =
      Boolean(r.subscribedAt) && new Date(r.subscribedAt as string).getTime() >= started;
    // 転換済みなら終了日前でも確定。未転換は終了日を過ぎて初めて「転換しなかった」と数える。
    if (subscribedAfterTrial || isLive) {
      total += 1;
      converted += 1;
    } else if (ended) {
      total += 1;
    }
  }
  return { converted, total, rate: safeRate(converted, total) };
}

export type RetentionRow = {
  subscribedAt: string | null;
  canceledAt: string | null;
};

/**
 * 有料開始後30日の継続率。
 * 分母: 30〜60日前に有料開始した人（30日経過が確定している人だけ）。
 * 分子: 開始から30日の時点で解約していなかった人。
 */
export function retention30d(
  rows: RetentionRow[],
  now: Date
): { retained: number; total: number; rate: number | null } {
  const to = now.getTime() - 30 * DAY_MS;
  const from = now.getTime() - 60 * DAY_MS;
  let total = 0;
  let retained = 0;
  for (const r of rows) {
    if (!r.subscribedAt) continue;
    const started = new Date(r.subscribedAt).getTime();
    if (started < from || started > to) continue;
    total += 1;
    const canceled = r.canceledAt ? new Date(r.canceledAt).getTime() : null;
    if (canceled === null || canceled > started + 30 * DAY_MS) retained += 1;
  }
  return { retained, total, rate: safeRate(retained, total) };
}

/** 月次解約率 = 直近30日の確定解約 ÷ 30日前の有料契約数 */
export function monthlyChurn(cancelsLast30d: number, payingAtStart: number): number | null {
  return safeRate(cancelsLast30d, payingAtStart);
}

export type PayoutRuleLite = {
  scope_type: "global" | "cast" | "cast_plan";
  cast_id: string | null;
  plan_code: string | null;
  percent: number;
  effective_from: string;
  effective_to: string | null;
};

/**
 * 配分率の解決（Webhook の resolveSubscriptionPayoutRule と同じ優先順位: cast_plan > cast > global）。
 * 運営担当（admin ロール）は配分なし＝0%。ルールが無い場合も 0%（KPI は推定なので止めない）。
 */
export function resolvePayoutPercent(
  rules: PayoutRuleLite[],
  castId: string | null,
  planCode: string,
  todayJst: string,
  isOwnerCast: boolean
): number {
  if (isOwnerCast) return 0;
  const effective = rules.filter(
    (r) => r.effective_from <= todayJst && (r.effective_to === null || r.effective_to >= todayJst)
  );
  const pick = (pred: (r: PayoutRuleLite) => boolean) =>
    effective
      .filter(pred)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null;
  const rule =
    (castId
      ? pick((r) => r.scope_type === "cast_plan" && r.cast_id === castId && r.plan_code === planCode) ??
        pick((r) => r.scope_type === "cast" && r.cast_id === castId)
      : null) ?? pick((r) => r.scope_type === "global");
  return rule ? Number(rule.percent) : 0;
}

export type GrossMarginInput = {
  mrrInclTaxJpy: number;
  /** 税抜ベースの配分合計 */
  payoutJpy: number;
  payingCount: number;
  assumptions: {
    stripeFeeRate: number;
    linePerMessageJpy: number;
    assumedMessagesPerUserPerMonth: number;
    taxRate: number;
  };
};

/** 運営粗利（推定・月）= 税抜MRR − 配分 − 決済手数料 − LINE従量 */
export function estimateGrossMargin(input: GrossMarginInput): {
  grossMarginJpy: number;
  mrrExclTaxJpy: number;
  stripeFeeJpy: number;
  lineCostJpy: number;
} {
  const { mrrInclTaxJpy, payoutJpy, payingCount, assumptions } = input;
  const mrrExclTaxJpy = Math.round(mrrInclTaxJpy / (1 + assumptions.taxRate));
  const stripeFeeJpy = Math.round(mrrInclTaxJpy * assumptions.stripeFeeRate);
  const lineCostJpy = Math.round(
    payingCount * assumptions.assumedMessagesPerUserPerMonth * assumptions.linePerMessageJpy
  );
  return {
    grossMarginJpy: mrrExclTaxJpy - Math.round(payoutJpy) - stripeFeeJpy - lineCostJpy,
    mrrExclTaxJpy,
    stripeFeeJpy,
    lineCostJpy,
  };
}

// ---------------------------------------------------------------------------
// P1
// ---------------------------------------------------------------------------

export type AiDraftRequestLite = { id: string; success: boolean };
export type AiDraftLite = {
  requestId: string;
  selectedAt: string | null;
  body: string;
  sentBody: string | null;
};

/**
 * AI下書きの採用率。
 * 分母: 成功した生成リクエスト。分子: 配下の下書きが1つでも採用されたリクエスト。
 * 採用のうち「そのまま」= sent_body が body と一致。
 */
export function aiAdoption(
  requests: AiDraftRequestLite[],
  drafts: AiDraftLite[]
): {
  requests: number;
  adopted: number;
  unedited: number;
  edited: number;
  rate: number | null;
  uneditedRate: number | null;
} {
  const okIds = new Set(requests.filter((r) => r.success).map((r) => r.id));
  const adoptedByRequest = new Map<string, "unedited" | "edited">();
  for (const d of drafts) {
    if (!okIds.has(d.requestId) || !d.selectedAt) continue;
    const kind = d.sentBody !== null && d.sentBody.trim() === d.body.trim() ? "unedited" : "edited";
    // 同一リクエストで複数採用は無いが、あっても「そのまま」を優先
    if (adoptedByRequest.get(d.requestId) !== "unedited") adoptedByRequest.set(d.requestId, kind);
  }
  let unedited = 0;
  let edited = 0;
  for (const kind of adoptedByRequest.values()) {
    if (kind === "unedited") unedited += 1;
    else edited += 1;
  }
  const adopted = unedited + edited;
  return {
    requests: okIds.size,
    adopted,
    unedited,
    edited,
    rate: safeRate(adopted, okIds.size),
    uneditedRate: safeRate(unedited, adopted),
  };
}

export type OutboundMessageLite = {
  staffId: string | null;
  createdAt: string;
  handlingSeconds: number | null;
};

export type StaffWorkload = {
  staffId: string;
  replies: number;
  repliesPerDay: number;
  handlingSamples: number;
  handlingMedianSeconds: number | null;
  handlingHoursPerDay: number | null;
};

/** 担当者別の返信量と実作業時間（直近 days 日） */
export function staffWorkload(messages: OutboundMessageLite[], days: number): StaffWorkload[] {
  const byStaff = new Map<string, OutboundMessageLite[]>();
  for (const m of messages) {
    if (!m.staffId) continue;
    byStaff.set(m.staffId, [...(byStaff.get(m.staffId) ?? []), m]);
  }
  return [...byStaff.entries()].map(([staffId, rows]) => {
    const handling = rows
      .map((r) => r.handlingSeconds)
      .filter((s): s is number => s !== null && s >= 0);
    const totalSeconds = handling.reduce((a, b) => a + b, 0);
    return {
      staffId,
      replies: rows.length,
      repliesPerDay: rows.length / days,
      handlingSamples: handling.length,
      handlingMedianSeconds: median(handling),
      // 計測済みの返信だけで1日あたりに換算（未計測分は0ではなく除外）
      handlingHoursPerDay: handling.length > 0 ? totalSeconds / days / 3600 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// P2
// ---------------------------------------------------------------------------

export type ReportEvent = { endUserId: string; occurredAt: string };

/** 週あたりの報告日数（直近7日に受信またはチェックインがあった JST 日数の平均） */
export function reportDaysPerWeek(
  events: ReportEvent[],
  userIds: string[],
  now: Date
): { average: number | null; users: number } {
  if (userIds.length === 0) return { average: null, users: 0 };
  const from = now.getTime() - 7 * DAY_MS;
  const days = new Map<string, Set<string>>();
  for (const id of userIds) days.set(id, new Set());
  for (const e of events) {
    const t = new Date(e.occurredAt).getTime();
    if (t < from || t > now.getTime()) continue;
    days.get(e.endUserId)?.add(jstDateKey(e.occurredAt));
  }
  let sum = 0;
  for (const set of days.values()) sum += set.size;
  return { average: sum / userIds.length, users: userIds.length };
}

export type TrialStartLite = { endUserId: string; trialStartedAt: string };

/** トライアル開始から withinHours 以内に最初の報告（受信 or チェックイン）があった割合 */
export function firstReportRate(
  trials: TrialStartLite[],
  events: ReportEvent[],
  now: Date,
  withinHours = 72,
  windowDays = 60
): { reported: number; total: number; rate: number | null } {
  const from = now.getTime() - windowDays * DAY_MS;
  const firstEvent = new Map<string, number>();
  for (const e of events) {
    const t = new Date(e.occurredAt).getTime();
    const prev = firstEvent.get(e.endUserId);
    if (prev === undefined || t < prev) firstEvent.set(e.endUserId, t);
  }
  let total = 0;
  let reported = 0;
  for (const tr of trials) {
    const started = new Date(tr.trialStartedAt).getTime();
    if (started < from) continue;
    const deadline = started + withinHours * 3600 * 1000;
    // 期限がまだ来ていない人は結果未確定 → 分母に入れない（報告済みなら入れる）
    const first = firstEvent.get(tr.endUserId);
    const reportedInTime = first !== undefined && first >= started && first <= deadline;
    if (reportedInTime) {
      total += 1;
      reported += 1;
    } else if (deadline <= now.getTime()) {
      total += 1;
    }
  }
  return { reported, total, rate: safeRate(reported, total) };
}

/** 解約理由の分布（コード別件数、多い順） */
export function cancelReasonBreakdown(
  reasons: (string | null | undefined)[]
): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of reasons) {
    const key = r && r.trim() ? r.trim() : "unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}
