/**
 * 税・配分計算ユーティリティ（テスト可能な純粋関数）
 */

/**
 * 税計算（端数切り捨て）
 */
export function calculateTax(
  amountExclTax: number,
  taxRate: number
): {
  amountExclTax: number;
  taxJpy: number;
  amountInclTax: number;
} {
  const taxJpy = Math.floor(amountExclTax * taxRate);
  return {
    amountExclTax,
    taxJpy,
    amountInclTax: amountExclTax + taxJpy,
  };
}

/**
 * 配分計算（端数切り捨て）
 */
export function calculatePayout(
  amountExclTax: number,
  percentRate: number
): {
  payoutAmount: number;
  percentApplied: number;
} {
  const payoutAmount = Math.floor((amountExclTax * percentRate) / 100);
  return {
    payoutAmount,
    percentApplied: percentRate,
  };
}

/**
 * ポイント残高計算
 */
export function calculateBalance(
  ledgerEntries: { delta_points: number }[]
): number {
  return ledgerEntries.reduce((sum, entry) => sum + entry.delta_points, 0);
}

/**
 * 配分ルール解決（優先順位）
 * 1. cast × gift（個別）
 * 2. cast × gift_category
 * 3. cast × all_gift（cast）
 * 4. global default
 */
export type PayoutRule = {
  id: string;
  rule_type: string;
  scope_type: string;
  cast_id: string | null;
  gift_id: string | null;
  gift_category: string | null;
  percent: number;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
};

export function resolvePayoutRule(
  rules: PayoutRule[],
  castId: string,
  giftId: string,
  giftCategory: string,
  occurredOn: string
): PayoutRule | null {
  // 有効なルールのみフィルタ
  const validRules = rules.filter((r) => {
    if (!r.active) return false;
    if (r.effective_from > occurredOn) return false;
    if (r.effective_to && r.effective_to < occurredOn) return false;
    return true;
  });

  // 優先順位で検索
  // 1. cast × gift
  const castGiftRule = validRules.find(
    (r) =>
      r.scope_type === "cast_gift" &&
      r.cast_id === castId &&
      r.gift_id === giftId
  );
  if (castGiftRule) return castGiftRule;

  // 2. cast × gift_category
  const castCategoryRule = validRules.find(
    (r) =>
      r.scope_type === "cast_gift_category" &&
      r.cast_id === castId &&
      r.gift_category === giftCategory
  );
  if (castCategoryRule) return castCategoryRule;

  // 3. cast × all_gift
  const castRule = validRules.find(
    (r) => r.scope_type === "cast" && r.cast_id === castId
  );
  if (castRule) return castRule;

  // 4. global
  const globalRule = validRules.find((r) => r.scope_type === "global");
  if (globalRule) return globalRule;

  return null;
}

/**
 * SLA残り時間計算（分）
 */
export function calculateSlaRemaining(
  lastUserMessageAt: Date | null,
  slaMinutes: number,
  now: Date = new Date()
): number | null {
  if (!lastUserMessageAt) return null;

  const deadlineAt = new Date(lastUserMessageAt.getTime() + slaMinutes * 60 * 1000);
  const remainingMs = deadlineAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(remainingMs / (60 * 1000)));
}

/**
 * 未報告判定（チェックイン2日なし + メッセージ2日なし）
 */
export function isUnreported(
  lastCheckinAt: Date | null,
  lastMessageAt: Date | null,
  thresholdDays: number = 2,
  now: Date = new Date()
): boolean {
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  const checkinUnreported =
    !lastCheckinAt || now.getTime() - lastCheckinAt.getTime() > thresholdMs;
  const messageUnreported =
    !lastMessageAt || now.getTime() - lastMessageAt.getTime() > thresholdMs;

  return checkinUnreported && messageUnreported;
}

/**
 * Inbox優先度スコア計算（改善版）
 * 高いほど優先
 * 
 * 優先度階層:
 * 1. 未返信ユーザー（10000点ベース + SLA残時間ボーナス）
 * 2. 今日未送信ユーザー（5000点ベース）
 * 3. その他（1000点ベース）
 * + リスク、未報告、プランによる追加点
 */
export function calculateInboxPriority(params: {
  hasRisk: boolean;
  slaRemainingMinutes: number | null;
  slaWarningMinutes: number;
  isUnreported: boolean;
  isPaused: boolean;
  planPriorityLevel: number; // 1=Premium, 2=Standard, 3=Light
  // 新しいパラメータ
  hasUnrepliedMessage?: boolean;
  hasSentTodayMessage?: boolean;
  lastMessageTimestamp?: number; // より新しいメッセージを優先するため
}): number {
  let score = 0;

  // 新しいロジック: 返信状態による基本スコア
  if (params.hasUnrepliedMessage !== undefined) {
    // 未返信は最優先（10000点ベース）
    if (params.hasUnrepliedMessage) {
      score += 10000;
      // SLA残時間が少ないほど高スコア（最大1000点追加）
      if (params.slaRemainingMinutes !== null) {
        score += Math.max(0, 1000 - params.slaRemainingMinutes);
      }
    }
    // 返信済みだが今日未送信（5000点ベース）
    else if (!params.hasSentTodayMessage) {
      score += 5000;
    }
    // その他（1000点ベース）
    else {
      score += 1000;
    }
  } else {
    // 旧ロジック（後方互換性のため）
    // SLA警告圏内 (+1000)
    if (
      params.slaRemainingMinutes !== null &&
      params.slaRemainingMinutes <= params.slaWarningMinutes
    ) {
      score += 1000;
    }
  }

  // 危険フラグ (+500)
  if (params.hasRisk) {
    score += 500;
  }

  // 未報告 (+300)
  if (params.isUnreported) {
    score += 300;
  }

  // プラン優先度（Premium=300, Standard=200, Light=100）
  score += (4 - params.planPriorityLevel) * 100;

  // 最終メッセージ時刻による微調整（新しいほど高い、最大50点）
  if (params.lastMessageTimestamp) {
    const nowMs = Date.now();
    const ageHours = (nowMs - params.lastMessageTimestamp) / (1000 * 60 * 60);
    score += Math.max(0, 50 - Math.floor(ageHours));
  }

  // paused は優先度を大幅に下げる (-5000)
  if (params.isPaused) {
    score -= 5000;
  }

  return score;
}

/**
 * 今日（JST）にメッセージを送信したかどうか判定
 */
export function hasSentMessageToday(
  lastSentAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastSentAt) return false;
  
  // JST (UTC+9) で今日の日付を取得
  const todayJst = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const sentDateJst = lastSentAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  
  return todayJst === sentDateJst;
}
