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

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const TRIAL_PERIOD_DAYS = parseInt(process.env.TRIAL_PERIOD_DAYS ?? "7", 10);

// デフォルト価格（plan_pricesテーブルから取得するべきだが、フォールバック用）
const DEFAULT_PRICES: Record<string, number> = {
  light: 4980,
  standard: 9800,
  premium: 29800,
};

// デフォルトStripe Price ID（環境変数から取得）
const DEFAULT_STRIPE_PRICE_IDS: Record<string, string> = {
  light: process.env.STRIPE_PRICE_LIGHT ?? "",
  standard: process.env.STRIPE_PRICE_STANDARD ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
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
  prices: CastPlanPrices;
  stripePriceIds: Record<string, string>;
  acceptingNewUsers: boolean;
  capacityLimit: number | null;
  assignedCount: number;
  photos: CastPhotoSummary[];
};

export type ListAvailableCastsInput = {
  planCode?: PlanCode;
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
  const { data: casts, error: castsError } = await supabase
    .from("staff_profiles")
    .select("id, display_name, style_summary, capacity_limit, accepting_new_users")
    .eq("role", "cast")
    .eq("active", true)
    .eq("accepting_new_users", true)
    .order("display_name");

  if (castsError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "キャスト情報の取得に失敗しました" },
    };
  }

  // 各キャストの担当ユーザー数と価格オーバーライドを取得
  const result: AvailableCast[] = await Promise.all(
    (casts ?? []).map(async (cast) => {
      // 担当ユーザー数
      const { count: assignedCount } = await supabase
        .from("end_users")
        .select("*", { count: "exact", head: true })
        .eq("assigned_cast_id", cast.id)
        .neq("status", "incomplete");

      // キャパシティチェック
      if (cast.capacity_limit !== null && (assignedCount ?? 0) >= cast.capacity_limit) {
        return null; // キャパオーバーのキャストは除外
      }

      // 価格オーバーライド取得
      const { data: priceOverrides } = await supabase
        .from("cast_plan_price_overrides")
        .select("plan_code, amount_monthly, stripe_price_id")
        .eq("cast_id", cast.id)
        .eq("active", true);

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

      for (const override of priceOverrides ?? []) {
        const plan = override.plan_code as keyof CastPlanPrices;
        if (plan in prices) {
          prices[plan] = override.amount_monthly;
          stripePriceIds[plan] = override.stripe_price_id;
        }
      }

      if (parsed.data.planCode && !stripePriceIds[parsed.data.planCode]) {
        return null; // 指定プランの価格がないキャストは除外
      }

      // 写真取得
      const { data: castPhotos } = await supabase
        .from("cast_photos")
        .select("id, storage_path, caption")
        .eq("cast_id", cast.id)
        .eq("active", true)
        .order("display_order");

      const photos: CastPhotoSummary[] = (castPhotos ?? []).map((p) => ({
        id: p.id,
        url: supabase.storage.from("cast-photos").getPublicUrl(p.storage_path).data.publicUrl,
        caption: p.caption,
      }));

      return {
        id: cast.id,
        displayName: cast.display_name,
        bio: cast.style_summary,
        prices,
        stripePriceIds,
        acceptingNewUsers: cast.accepting_new_users,
        capacityLimit: cast.capacity_limit,
        assignedCount: assignedCount ?? 0,
        photos,
      };
    })
  );

  // nullを除外（キャパオーバーのキャスト）
  const filteredCasts = result.filter((c): c is AvailableCast => c !== null);

  return { ok: true, data: { casts: filteredCasts } };
}

export type CreateSubscriptionCheckoutInput = {
  lineUserId: string;
  castId: string;
  planCode: PlanCode;
};

export type CreateSubscriptionCheckoutResult = Result<{ checkoutUrl: string }>;

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

// 互換用エイリアス（既存UIで使用）
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
