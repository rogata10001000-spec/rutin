"use server";

import { logger } from "@/lib/logger";
import {
  createSubscriptionCheckoutSchema,
  listAvailableCastsSchema,
  planCodeSchema,
} from "@/schemas/subscriptions";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { createSubscriptionCheckout as stripeCreateCheckout } from "@/lib/stripe";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { getUserFromServerCookies } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import {
  subscribeCheckoutCancelUrl,
  subscribeCheckoutSuccessUrl,
} from "@/lib/subscribe-paths";
import { calculateAge } from "@/lib/age";
import { getTrialPeriodDaysForPlan } from "@/lib/trial";
import {
  PLAN_CODES,
  DEFAULT_PLAN_PRICES,
  DEFAULT_ANNUAL_PRICES,
  defaultStripePriceIds,
  annualStripePriceIds,
  resolvePlanPricing,
  type BillingInterval,
} from "@/lib/plan-pricing";
import type { StaffGender } from "@/lib/supabase/types";

const serverEnv = getServerEnv();
const APP_BASE_URL = serverEnv.APP_BASE_URL;

// 価格・Stripe Price ID のデフォルトは lib/plan-pricing.ts を単一ソースとする（設定の二重定義を防止）
const DEFAULT_PRICES = DEFAULT_PLAN_PRICES;
const DEFAULT_STRIPE_PRICE_IDS = defaultStripePriceIds();

export type PlanCode = (typeof planCodeSchema)["_type"];

export type CastPlanPrices = {
  light: number;
  standard: number;
  premium: number;
};

// CastPhoto型は cast-photos.ts で定義されたものを使用
// ただし、一覧表示用にはdisplayOrderは不要なので簡易型を使用
export type CastPhotoSummary = {
  id: string;
  url: string;
  caption: string | null;
};

export type AvailableCast = {
  id: string;
  displayName: string;
  bio: string | null;
  publicProfile: string | null;
  age: number | null;
  gender: StaffGender | null;
  prices: CastPlanPrices;
  stripePriceIds: Record<string, string>;
  // 年額（全プランでデフォルト価格・メイト別オーバーライドは月額のみ）
  annualEnabled: boolean;
  annualPrices: CastPlanPrices;
  annualStripePriceIds: Record<string, string>;
  acceptingNewUsers: boolean;
  capacityLimit: number | null;
  assignedCount: number;
  photos: CastPhotoSummary[];
};

export type ListAvailableCastsInput = {
  planCode?: PlanCode;
  gender?: StaffGender;
};

export type ListAvailableCastsResult = Result<{ casts: AvailableCast[] }>;

/**
 * 新規受付可能なメイト一覧取得
 * 権限: 公開（サブスク導線用）
 */
export async function listAvailableCasts(
  input: ListAvailableCastsInput = {}
): Promise<ListAvailableCastsResult> {
  const parsed = listAvailableCastsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // service_roleで取得（公開API）
  const supabase = createAdminSupabaseClient();

  // アクティブで新規受付中のメイトを取得
  let castsQuery = supabase
    .from("staff_profiles")
    .select(
      "id, display_name, style_summary, public_profile, birth_date, capacity_limit, accepting_new_users, gender"
    )
    .eq("role", "cast")
    .eq("active", true)
    .eq("accepting_new_users", true)
    .order("display_name");

  if (parsed.data.gender) {
    castsQuery = castsQuery.eq("gender", parsed.data.gender);
  }

  const { data: casts, error: castsError } = await castsQuery;

  if (castsError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メイト情報の取得に失敗しました" },
    };
  }

  const castIds = (casts ?? []).map((c) => c.id);
  if (castIds.length === 0) {
    return { ok: true, data: { casts: [] } };
  }

  // バッチ取得: 担当ユーザー、価格オーバーライド、デフォルト価格、写真を1クエリずつまとめる
  const [assignedRowsRes, priceOverridesRes, planPricesRes, castPhotosRes] = await Promise.all([
    supabase
      .from("end_users")
      .select("assigned_cast_id")
      .in("assigned_cast_id", castIds)
      .not("status", "in", '("incomplete","canceled")'),
    supabase
      .from("cast_plan_price_overrides")
      .select(
        "cast_id, plan_code, amount_monthly, stripe_price_id, amount_annual, stripe_price_id_annual"
      )
      .in("cast_id", castIds)
      .eq("active", true),
    supabase
      .from("plan_prices")
      .select(
        "plan_code, amount_monthly, stripe_price_id, amount_annual, stripe_price_id_annual, valid_from"
      )
      .eq("active", true)
      .order("valid_from", { ascending: false }),
    supabase
      .from("cast_photos")
      .select("id, cast_id, storage_path, caption")
      .in("cast_id", castIds)
      .eq("active", true)
      .order("display_order"),
  ]);

  const assignedCountByCast = new Map<string, number>();
  for (const row of assignedRowsRes.data ?? []) {
    if (!row.assigned_cast_id) continue;
    assignedCountByCast.set(
      row.assigned_cast_id,
      (assignedCountByCast.get(row.assigned_cast_id) ?? 0) + 1
    );
  }

  type OverrideRow = {
    plan_code: string;
    amount_monthly: number;
    stripe_price_id: string;
    amount_annual: number | null;
    stripe_price_id_annual: string | null;
  };
  const overridesByCast = new Map<string, OverrideRow[]>();
  for (const ov of priceOverridesRes.data ?? []) {
    const list = overridesByCast.get(ov.cast_id) ?? [];
    list.push({
      plan_code: ov.plan_code,
      amount_monthly: ov.amount_monthly,
      stripe_price_id: ov.stripe_price_id,
      amount_annual: ov.amount_annual,
      stripe_price_id_annual: ov.stripe_price_id_annual,
    });
    overridesByCast.set(ov.cast_id, list);
  }

  // デフォルト価格（plan_prices）を解決。未設定は env/ハードコードにフォールバック。
  const defaultMonthly: CastPlanPrices = { ...DEFAULT_PRICES };
  const defaultMonthlyIds: Record<string, string> = { ...DEFAULT_STRIPE_PRICE_IDS };
  const defaultAnnual: CastPlanPrices = { ...DEFAULT_ANNUAL_PRICES };
  const defaultAnnualIds: Record<string, string> = { ...annualStripePriceIds() };
  const seenDefaultPlan = new Set<string>();
  for (const row of planPricesRes.data ?? []) {
    const code = row.plan_code as keyof CastPlanPrices;
    if (!(code in defaultMonthly) || seenDefaultPlan.has(row.plan_code)) continue;
    seenDefaultPlan.add(row.plan_code);
    if (row.amount_monthly != null && row.stripe_price_id) {
      defaultMonthly[code] = row.amount_monthly;
      defaultMonthlyIds[code] = row.stripe_price_id;
    }
    if (row.amount_annual != null && row.stripe_price_id_annual) {
      defaultAnnual[code] = row.amount_annual;
      defaultAnnualIds[code] = row.stripe_price_id_annual;
    }
  }

  const photosByCast = new Map<string, CastPhotoSummary[]>();
  for (const photo of castPhotosRes.data ?? []) {
    const list = photosByCast.get(photo.cast_id) ?? [];
    list.push({
      id: photo.id,
      url: supabase.storage.from("cast-photos").getPublicUrl(photo.storage_path).data.publicUrl,
      caption: photo.caption,
    });
    photosByCast.set(photo.cast_id, list);
  }

  const result: AvailableCast[] = [];
  for (const cast of casts ?? []) {
    const assignedCount = assignedCountByCast.get(cast.id) ?? 0;

    // キャパシティチェック
    if (cast.capacity_limit !== null && assignedCount >= cast.capacity_limit) {
      continue;
    }

    // 価格解決（メイト別オーバーライド > デフォルト(plan_prices) > env/ハードコード）
    const prices: CastPlanPrices = { ...defaultMonthly };
    const stripePriceIds: Record<string, string> = { ...defaultMonthlyIds };
    const annualPrices: CastPlanPrices = { ...defaultAnnual };
    const annualPriceIds: Record<string, string> = { ...defaultAnnualIds };

    for (const override of overridesByCast.get(cast.id) ?? []) {
      const plan = override.plan_code as keyof CastPlanPrices;
      if (!(plan in prices)) continue;
      prices[plan] = override.amount_monthly;
      stripePriceIds[plan] = override.stripe_price_id;
      if (override.amount_annual != null && override.stripe_price_id_annual) {
        annualPrices[plan] = override.amount_annual;
        annualPriceIds[plan] = override.stripe_price_id_annual;
      }
    }

    // 年額導線は全プランの年額Priceが揃っているメイトのみ表示
    const annualEnabled = PLAN_CODES.every((code) => Boolean(annualPriceIds[code]));

    if (parsed.data.planCode && !stripePriceIds[parsed.data.planCode]) {
      continue;
    }

    result.push({
      id: cast.id,
      displayName: cast.display_name,
      bio: cast.style_summary,
      publicProfile: cast.public_profile ?? null,
      age: calculateAge(cast.birth_date),
      gender: (cast.gender as StaffGender | null) ?? null,
      prices,
      stripePriceIds,
      annualEnabled,
      annualPrices,
      annualStripePriceIds: annualPriceIds,
      acceptingNewUsers: cast.accepting_new_users,
      capacityLimit: cast.capacity_limit,
      assignedCount,
      photos: photosByCast.get(cast.id) ?? [],
    });
  }

  return { ok: true, data: { casts: result } };
}

export type CreateSubscriptionCheckoutInput = {
  lineUserId: string;
  castId: string;
  planCode: PlanCode;
  interval?: BillingInterval;
};

export type CreateSubscriptionCheckoutResult = Result<{ checkoutUrl: string }>;

export type CreateSubscriptionCheckoutForCurrentUserInput = {
  castId: string;
  planCode: PlanCode;
  interval?: BillingInterval;
};

/**
 * サブスクリプションCheckout Session作成
 * 権限: 公開（LINE経由）
 */
export async function createSubscriptionCheckoutSession(
  input: CreateSubscriptionCheckoutInput
): Promise<CreateSubscriptionCheckoutResult> {
  const parsed = createSubscriptionCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = createAdminSupabaseClient();

  // メイト存在確認
  const { data: cast } = await supabase
    .from("staff_profiles")
    .select("id, display_name, accepting_new_users, capacity_limit")
    .eq("id", parsed.data.castId)
    .eq("role", "cast")
    .eq("active", true)
    .single();

  if (!cast) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "メイトが見つかりません" },
    };
  }

  if (!cast.accepting_new_users) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "このメイトは現在新規受付を停止しています" },
    };
  }

  // キャパシティ再検証
  if (cast.capacity_limit !== null) {
    const { count: assignedCount } = await supabase
      .from("end_users")
      .select("*", { count: "exact", head: true })
      .eq("assigned_cast_id", cast.id)
      .not("status", "in", '("incomplete","canceled")');

    if ((assignedCount ?? 0) >= cast.capacity_limit) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "このメイトの受付枠が満員です" },
      };
    }
  }

  const interval: BillingInterval = parsed.data.interval ?? "month";

  // 価格ID解決（メイト別オーバーライド > デフォルト(plan_prices) > env/ハードコード）。
  // 月額/年額ともに同じ解決ロジックを使い、表示と請求のソースを一本化する。
  const pricing = await resolvePlanPricing(supabase, parsed.data.castId, interval);
  const stripePriceId = pricing[parsed.data.planCode].stripePriceId;

  if (!stripePriceId) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: interval === "year" ? "年額プランは現在ご利用いただけません" : "価格設定が見つかりません",
      },
    };
  }

  // 既存ユーザーチェック（同じLINE IDで既にアクティブなサブスクがあるか）
  const { data: existingUser } = await supabase
    .from("end_users")
    .select("id, status")
    .eq("line_user_id", parsed.data.lineUserId)
    .not("status", "in", '("incomplete","canceled")')
    .single();

  if (existingUser) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "既に契約中のプランがあります" },
    };
  }

  // トライアルの重複付与を防ぐ: 過去に一度でもトライアルを開始した相手には付与しない
  // （解約→再契約で無料トライアルを無限取得する濫用を防止）。
  // trial_started_at は初回トライアル開始時に Stripe Webhook が設定する。
  const { data: priorUser } = await supabase
    .from("end_users")
    .select("trial_started_at")
    .eq("line_user_id", parsed.data.lineUserId)
    .maybeSingle();
  const hasUsedTrial = Boolean(priorUser?.trial_started_at);

  // トライアル: 月額はstandard/premiumのみ、年額は全プランに付与。ただし利用済みなら付与しない。
  const trialDays = hasUsedTrial
    ? undefined
    : getTrialPeriodDaysForPlan(parsed.data.planCode, interval);

  try {
    const { url, sessionId } = await stripeCreateCheckout({
      lineUserId: parsed.data.lineUserId,
      castId: parsed.data.castId,
      planCode: parsed.data.planCode,
      stripePriceId,
      billingInterval: interval,
      successUrl: subscribeCheckoutSuccessUrl(),
      cancelUrl: subscribeCheckoutCancelUrl(),
      trialPeriodDays: trialDays,
    });

    if (!url) {
      throw new Error("Checkout URL is null");
    }

    // カゴ落ちリカバリ配信の起点を記録（未契約=incomplete のみ。決済完了で status が変わり対象外になる）
    await supabase
      .from("end_users")
      .update({ checkout_started_at: new Date().toISOString() })
      .eq("line_user_id", parsed.data.lineUserId)
      .eq("status", "incomplete");

    // 監査ログ
    await writeAuditLog({
      action: "SUBSCRIPTION_CHECKOUT_CREATE",
      targetType: "checkout_sessions",
      targetId: sessionId,
      success: true,
      metadata: buildAuditMetadata({
        line_user_id: parsed.data.lineUserId,
        cast_id: parsed.data.castId,
        plan_code: parsed.data.planCode,
        trial_days: trialDays ?? 0,
      }),
      actorStaffId: null, // ユーザー操作
    });

    return { ok: true, data: { checkoutUrl: url } };
  } catch (err) {
    logger.error("subscriptions: checkout creation failed", { error: err instanceof Error ? err.message : String(err) });
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "決済ページの作成に失敗しました" },
    };
  }
}

/**
 * Cookieに保存されたLINEユーザートークンからCheckout Sessionを作成
 * 権限: LINE導線から入ったユーザー
 */
export async function createSubscriptionCheckoutForCurrentUser(
  input: CreateSubscriptionCheckoutForCurrentUserInput
): Promise<CreateSubscriptionCheckoutResult> {
  const user = await getUserFromServerCookies();
  if (!user.ok) {
    const isExpired = "error" in user && user.error === "expired";
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: isExpired ? "LINE連携の有効期限が切れています" : "LINEの案内リンクからアクセスしてください",
      },
    };
  }

  // 新規契約は LINE 連携が前提（Stripe metadata に line_user_id が必要）
  let lineUserId = user.lineUserId;
  if (!lineUserId && user.endUserId) {
    const supabase = createAdminSupabaseClient();
    const { data: endUser } = await supabase
      .from("end_users")
      .select("line_user_id")
      .eq("id", user.endUserId)
      .maybeSingle();
    lineUserId = endUser?.line_user_id ?? null;
  }
  if (!lineUserId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "新規のご契約はLINEの案内リンクからお手続きください。",
      },
    };
  }

  return createSubscriptionCheckoutSession({
    lineUserId,
    castId: input.castId,
    planCode: input.planCode,
    interval: input.interval,
  });
}

// 互換用エイリアス（既存UI以外の呼び出しで使用）
export async function createSubscriptionCheckout(
  input: CreateSubscriptionCheckoutInput
): Promise<CreateSubscriptionCheckoutResult> {
  return createSubscriptionCheckoutSession(input);
}

// =====================================
// プラン情報取得
// =====================================

export type PlanInfo = {
  code: string;
  name: string;
  replySlaMinutes: number;
  dailyCheckinEnabled: boolean;
  weeklyReviewEnabled: boolean;
  priorityLevel: number;
};

export type GetPlansResult = Result<{ plans: PlanInfo[] }>;

/**
 * プラン一覧取得（公開）
 */
export async function getPlans(): Promise<GetPlansResult> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("plans")
    .select("plan_code, name, reply_sla_minutes, daily_checkin_enabled, weekly_review_enabled, priority_level")
    .eq("active", true)
    .order("priority_level");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "プラン情報の取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      plans: (data ?? []).map((p) => ({
        code: p.plan_code,
        name: p.name,
        replySlaMinutes: p.reply_sla_minutes,
        dailyCheckinEnabled: p.daily_checkin_enabled,
        weeklyReviewEnabled: p.weekly_review_enabled,
        priorityLevel: p.priority_level,
      })),
    },
  };
}
