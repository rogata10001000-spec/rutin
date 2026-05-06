"use server";

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
import { calculateAge } from "@/lib/age";
import type { StaffGender } from "@/lib/supabase/types";

const serverEnv = getServerEnv();
const APP_BASE_URL = serverEnv.APP_BASE_URL;
const TRIAL_PERIOD_DAYS = serverEnv.TRIAL_PERIOD_DAYS;

// デフォルト価格（plan_pricesテーブルから取得するべきだが、フォールバック用）
const DEFAULT_PRICES: Record<string, number> = {
  light: 2980,
  standard: 6980,
  premium: 14800,
};

// デフォルトStripe Price ID（環境変数から取得）
const DEFAULT_STRIPE_PRICE_IDS: Record<string, string> = {
  light: serverEnv.STRIPE_PRICE_LIGHT ?? "",
  standard: serverEnv.STRIPE_PRICE_STANDARD ?? "",
  premium: serverEnv.STRIPE_PRICE_PREMIUM ?? "",
};

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
 * 新規受付可能なキャスト一覧取得
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

  // アクティブで新規受付中のキャストを取得
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
      error: { code: "UNKNOWN", message: "キャスト情報の取得に失敗しました" },
    };
  }

  const castIds = (casts ?? []).map((c) => c.id);
  if (castIds.length === 0) {
    return { ok: true, data: { casts: [] } };
  }

  // バッチ取得: 担当ユーザー、価格オーバーライド、写真を1クエリずつまとめる
  const [assignedRowsRes, priceOverridesRes, castPhotosRes] = await Promise.all([
    supabase
      .from("end_users")
      .select("assigned_cast_id")
      .in("assigned_cast_id", castIds)
      .neq("status", "incomplete"),
    supabase
      .from("cast_plan_price_overrides")
      .select("cast_id, plan_code, amount_monthly, stripe_price_id")
      .in("cast_id", castIds)
      .eq("active", true),
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

  const overridesByCast = new Map<
    string,
    Array<{ plan_code: string; amount_monthly: number; stripe_price_id: string }>
  >();
  for (const ov of priceOverridesRes.data ?? []) {
    const list = overridesByCast.get(ov.cast_id) ?? [];
    list.push({
      plan_code: ov.plan_code,
      amount_monthly: ov.amount_monthly,
      stripe_price_id: ov.stripe_price_id,
    });
    overridesByCast.set(ov.cast_id, list);
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

    // 価格解決（オーバーライド > デフォルト）
    const prices: CastPlanPrices = {
      light: DEFAULT_PRICES.light,
      standard: DEFAULT_PRICES.standard,
      premium: DEFAULT_PRICES.premium,
    };

    const stripePriceIds: Record<string, string> = {
      light: DEFAULT_STRIPE_PRICE_IDS.light,
      standard: DEFAULT_STRIPE_PRICE_IDS.standard,
      premium: DEFAULT_STRIPE_PRICE_IDS.premium,
    };

    for (const override of overridesByCast.get(cast.id) ?? []) {
      const plan = override.plan_code as keyof CastPlanPrices;
      if (plan in prices) {
        prices[plan] = override.amount_monthly;
        stripePriceIds[plan] = override.stripe_price_id;
      }
    }

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
};

export type CreateSubscriptionCheckoutResult = Result<{ checkoutUrl: string }>;

export type CreateSubscriptionCheckoutForCurrentUserInput = {
  castId: string;
  planCode: PlanCode;
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

  // キャスト存在確認
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
      error: { code: "NOT_FOUND", message: "キャストが見つかりません" },
    };
  }

  if (!cast.accepting_new_users) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "このキャストは現在新規受付を停止しています" },
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
        error: { code: "CONFLICT", message: "このキャストの受付枠が満員です" },
      };
    }
  }

  // 価格ID解決（オーバーライド > デフォルト）
  let stripePriceId = DEFAULT_STRIPE_PRICE_IDS[parsed.data.planCode];

  const { data: priceOverride } = await supabase
    .from("cast_plan_price_overrides")
    .select("stripe_price_id")
    .eq("cast_id", parsed.data.castId)
    .eq("plan_code", parsed.data.planCode)
    .eq("active", true)
    .order("valid_from", { ascending: false })
    .limit(1)
    .single();

  if (priceOverride?.stripe_price_id) {
    stripePriceId = priceOverride.stripe_price_id;
  }

  if (!stripePriceId) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "価格設定が見つかりません" },
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

  try {
    const { url, sessionId } = await stripeCreateCheckout({
      lineUserId: parsed.data.lineUserId,
      castId: parsed.data.castId,
      planCode: parsed.data.planCode,
      stripePriceId,
      successUrl: `${APP_BASE_URL}/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_BASE_URL}/subscribe?canceled=true`,
      trialPeriodDays: TRIAL_PERIOD_DAYS,
    });

    if (!url) {
      throw new Error("Checkout URL is null");
    }

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
        trial_days: TRIAL_PERIOD_DAYS,
      }),
      actorStaffId: null, // ユーザー操作
    });

    return { ok: true, data: { checkoutUrl: url } };
  } catch (err) {
    console.error("[Subscription] Checkout creation failed:", err);
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

  return createSubscriptionCheckoutSession({
    lineUserId: user.lineUserId,
    castId: input.castId,
    planCode: input.planCode,
  });
}

// 互換用エイリアス（既存UI以外の呼び出しで使用）
export const createSubscriptionCheckout = createSubscriptionCheckoutSession;

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
