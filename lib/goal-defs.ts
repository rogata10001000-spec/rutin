/**
 * 利用者の「目標」の定義（純粋・クライアント/サーバー共用）。
 * 3か月の型（docs/SOLO_SCALE_REQUIREMENTS.md §5・§6）: 卒業はさせず、達成したら次の目標へ。
 */

export const GOAL_CATEGORIES = ["exercise", "study", "life", "work", "other"] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  exercise: "運動",
  study: "勉強",
  life: "生活",
  work: "仕事",
  other: "その他",
};

export const GOAL_TITLE_MAX = 60;
/** 振り返り（次の目標を決める）までの日数 */
export const GOAL_REVIEW_DAYS = 90;

export type GoalStatus = "active" | "achieved" | "replaced";

export type GoalLike = {
  category: GoalCategory;
  title: string;
  weeklyTarget: number | null;
  startedAt: string; // YYYY-MM-DD
  reviewAt: string; // YYYY-MM-DD
};

export function isGoalCategory(v: unknown): v is GoalCategory {
  return typeof v === "string" && (GOAL_CATEGORIES as readonly string[]).includes(v);
}

export function normalizeGoalTitle(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function validateGoalInput(input: {
  category: unknown;
  title: string;
  weeklyTarget: number | null;
}): { ok: true; category: GoalCategory; title: string; weeklyTarget: number | null } | { ok: false; message: string } {
  if (!isGoalCategory(input.category)) return { ok: false, message: "種類を選んでください" };
  const title = normalizeGoalTitle(input.title);
  if (!title) return { ok: false, message: "目標を入力してください" };
  if (title.length > GOAL_TITLE_MAX) {
    return { ok: false, message: `目標は${GOAL_TITLE_MAX}文字以内で入力してください` };
  }
  if (input.weeklyTarget !== null) {
    if (!Number.isInteger(input.weeklyTarget) || input.weeklyTarget < 1 || input.weeklyTarget > 7) {
      return { ok: false, message: "週の回数は1〜7で選んでください" };
    }
  }
  return { ok: true, category: input.category, title, weeklyTarget: input.weeklyTarget };
}

export function jstDateOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(d);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function defaultReviewAt(startedAt: string): string {
  return addDays(startedAt, GOAL_REVIEW_DAYS);
}

export type GoalStage = {
  /** 1,2,3 は月目。4 = 4か月目以降（次の目標を決める時期） */
  month: 1 | 2 | 3 | 4;
  label: string;
  /** 開始からの経過日数 */
  days: number;
};

const STAGE_LABELS: Record<GoalStage["month"], string> = {
  1: "まず始める",
  2: "続けやすい型を作る",
  3: "自分で続けられる日を増やす",
  4: "次の目標を決める",
};

/** 開始日からの経過で3か月の型のどこにいるか（純日付計算・TZ非依存） */
export function goalStage(startedAt: string, today: string): GoalStage {
  const [y1, m1, d1] = startedAt.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  const days = Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
  const month: GoalStage["month"] = days < 30 ? 1 : days < 60 ? 2 : days < 90 ? 3 : 4;
  return { month, label: STAGE_LABELS[month], days };
}

export function formatGoalSummary(goal: Pick<GoalLike, "category" | "title" | "weeklyTarget">): string {
  const parts = [GOAL_CATEGORY_LABELS[goal.category], goal.title];
  if (goal.weeklyTarget) parts.push(`週${goal.weeklyTarget}回`);
  return parts.join("・");
}

/** 保存済みの目標（クライアント/サーバー共用の表示用型。取得は lib/goals.ts） */
export type ActiveGoal = {
  id: string;
  endUserId: string;
  category: GoalCategory;
  title: string;
  weeklyTarget: number | null;
  startedAt: string;
  reviewAt: string;
  status: GoalStatus;
};
