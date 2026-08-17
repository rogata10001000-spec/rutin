"use server";

import { logger } from "@/lib/logger";
import { after } from "next/server";
import {
  createSubscriptionCheckoutSchema,
  listAvailableCastsSchema,
  planCodeSchema,
} from "@/schemas/subscriptions";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  createSubscriptionCheckout as stripeCreateCheckout,
  expireCheckoutSession,
} from "@/lib/stripe";
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
import {
  getLiveContractedCastIds,
  getRelationshipsByLineUserId,
  hasPersonUsedTrial,
} from "@/lib/person";
import { canContractWithCast, MAX_CONCURRENT_MATES } from "@/lib/relationship-routing";
import { getPersonIdForEndUser } from "@/lib/person";

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
  input: ListAvailableCastsInput & {
    /**
     * 追加契約モード。true なら「既にライブ契約中のメイト」を候補から外す。
     * 選択できるのに必ず失敗する状態（＝押せるのに失敗）を作らないための入口ガード。
     */
     excludeContractedForCurrentUser?: boolean;
  } = {}
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

  // 追加契約では既に契約中のメイトを候補から外す
  let excludedCastIds: string[] = [];
  if (input.excludeContractedForCurrentUser) {
    try {
      const user = await getUserFromServerCookies();
      if (user.ok) {
        let personId: string | null = null;
        if (user.endUserId) {
          personId = await getPersonIdForEndUser(supabase, user.endUserId);
        } else if (user.lineUserId) {
          const rows = await getRelationshipsByLineUserId(supabase, user.lineUserId);
          personId = rows[0]?.personId ?? null;
        }
        if (personId) {
          excludedCastIds = await getLiveContractedCastIds(supabase, personId);
        }
      }
    } catch (err) {
      // 除外に失敗しても一覧は出す（サーバー側の契約ガードが最終防衛線として弾く）。
      // ここで落とすと「追加契約の入口ごと開けない」ほうの損失が大きい。
      logger.warn("listAvailableCasts: contracted-cast exclusion failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const visibleCasts = excludedCastIds.length
    ? (casts ?? []).filter((c) => !excludedCastIds.includes(c.id))
    : (casts ?? []);

  const castIds = visibleCasts.map((c) => c.id);
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
  for (const cast of visibleCasts) {
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

  // 複数メイト契約に対応したため、判定単位が2つに分かれる。
  //   人（person）単位 … トライアル権・同時契約数の上限
  //   メイト単位        … このメイトと既に契約していないか（＝重複契約）
  // どちらも end_users.status だけでは足りない（両テーブルの状態がズレると
  // 決済まで進んでしまい、webhook 側で「課金後に自動キャンセル＋返金」になる）。
  const relationships = await getRelationshipsByLineUserId(supabase, parsed.data.lineUserId);
  const personId = relationships[0]?.personId ?? null;

  // このメイトとの関係行（追加契約では存在しないのが普通）
  const castRelationship = relationships.find(
    (r) => r.assignedCastId === parsed.data.castId
  );

  const liveCastIds = personId ? await getLiveContractedCastIds(supabase, personId) : [];

  const gate = canContractWithCast({
    castId: parsed.data.castId,
    liveCastIds,
    maxConcurrent: MAX_CONCURRENT_MATES,
  });

  if (gate !== "ok") {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message:
          gate === "already_contracted"
            ? "このメイトとは既にご契約中です。"
            : `同時にご契約いただけるメイトは${MAX_CONCURRENT_MATES}人までです。`,
      },
    };
  }

  // トライアルの重複付与を防ぐ: **人単位**で、過去に一度でもトライアルを開始していたら付与しない。
  // 関係行（end_users）単位で見ると「メイトを変えるたびに無料トライアル」の穴になる。
  const hasUsedTrial = personId ? await hasPersonUsedTrial(supabase, personId) : false;

  // 前回のチェックアウトセッションは**このメイトとの関係行**のものだけを失効させる
  // （メイトAの決済ページを開いたままメイトBを申し込んでも互いを潰さない）。
  const existingUser = castRelationship
    ? (
        await supabase
          .from("end_users")
          .select("id, status, trial_started_at, stripe_checkout_session_id")
          .eq("id", castRelationship.endUserId)
          .maybeSingle()
      ).data
    : relationships.find((r) => r.assignedCastId === null)
      ? (
          await supabase
            .from("end_users")
            .select("id, status, trial_started_at, stripe_checkout_session_id")
            .eq("id", relationships.find((r) => r.assignedCastId === null)!.endUserId)
            .maybeSingle()
        ).data
      : null;

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
      personId,
    });

    if (!url) {
      throw new Error("Checkout URL is null");
    }

    // ここから先はユーザーに返す決済ページURLに影響しない後処理。
    // Stripe がURLを返した時点で待たせる理由がないため after() に逃がす
    // （promise を返すコールバックなので、サーバーレスでも完了は保証される）。
    const checkoutLineUserId = parsed.data.lineUserId;
    const checkoutCastId = parsed.data.castId;
    const checkoutPlanCode = parsed.data.planCode;
    const checkoutTrialDays = trialDays;
    const checkoutSessionId = sessionId;
    const previousSessionId = existingUser?.stripe_checkout_session_id ?? null;
    // 更新対象は「このメイトとの関係行」に限定する。line_user_id で更新すると
    // 複数メイト契約時に他メイトの行のセッションIDまで上書きし、
    // 別メイトの決済ページを巻き込んで失効させてしまう。
    const checkoutEndUserId = existingUser?.id ?? null;
    // 「カートに入れた時刻」は後処理の実行時刻ではなく操作時刻を記録する
    const checkoutStartedAt = new Date().toISOString();

    after(async () => {
      try {
        // 前の未決済セッションを失効させる（1ユーザー=1契約の防御・第1層）。
        // Stripe のチェックアウトは約24時間支払い可能なまま残るため、失効させないと
        // 「メイトAのページを開いたままメイトBでも申込→両方支払う」二重課金レースができてしまう。
        // 既に完了/失効済みのセッションへの expire はエラーになるが、それは望ましい状態なので無視する。
        if (previousSessionId && previousSessionId !== checkoutSessionId) {
          try {
            await expireCheckoutSession(previousSessionId);
          } catch {
            // completed / already expired → そのまま進める（webhook側のガードが第2層として控える）
          }
        }

        // 最新の未決済セッションIDを記録（次回発行時の失効対象）。
        // カゴ落ちリカバリ配信の起点も記録（未契約=incomplete のみ。決済完了で status が変わり対象外になる）
        //
        // 関係行がまだ無い（このメイトが初めて＆見込み行も無い）ケースでは記録先が無い。
        // その場合の失効は Stripe Webhook 側のガードに任せる（行が無い＝並行セッションも無い）。
        if (checkoutEndUserId) {
          await supabase
            .from("end_users")
            .update({ stripe_checkout_session_id: checkoutSessionId })
            .eq("id", checkoutEndUserId);
          await supabase
            .from("end_users")
            .update({ checkout_started_at: checkoutStartedAt })
            .eq("id", checkoutEndUserId)
            .eq("status", "incomplete");
        }

        await writeAuditLog({
          action: "SUBSCRIPTION_CHECKOUT_CREATE",
          targetType: "checkout_sessions",
          targetId: checkoutSessionId,
          success: true,
          metadata: buildAuditMetadata({
            line_user_id: checkoutLineUserId,
            cast_id: checkoutCastId,
            plan_code: checkoutPlanCode,
            trial_days: checkoutTrialDays ?? 0,
          }),
          actorStaffId: null, // ユーザー操作
        });
      } catch (err) {
        logger.error("subscriptions: checkout後処理に失敗", {
          sessionId: checkoutSessionId,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
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

// プラン一覧の公開API(getPlans)は削除した。
// 呼び出し元がゼロのまま plans.name / priority_level / daily_checkin_enabled を
// 返しており、「設定できるように見えて誰も読まない」死んだ設定の温床になっていた。
// プラン表示名は funnel_copy（/admin/preview）、SLAは lib/plan-sla.ts が正。

/**
 * いまログイン中の人に無料トライアルが付くか。
 *
 * トライアル権は **person 単位**（メイトを増やすたびに無料になる穴を塞ぐため）。
 * 画面のCTA・注記はこの値で切り替える。「◯日間無料」と書いてあるのに
 * 実際は即課金、という表示と請求の食い違いを防ぐ
 * （表示と確定は同じ判定を使う＝[共有関数1つ]）。
 */
export async function isTrialAvailableForCurrentUser(): Promise<boolean> {
  try {
    const user = await getUserFromServerCookies();
    if (!user.ok) return true; // 未ログイン（新規想定）は従来どおりトライアル前提で見せる

    const supabase = createAdminSupabaseClient();
    let personId: string | null = null;
    if (user.endUserId) {
      personId = await getPersonIdForEndUser(supabase, user.endUserId);
    } else if (user.lineUserId) {
      const rows = await getRelationshipsByLineUserId(supabase, user.lineUserId);
      personId = rows[0]?.personId ?? null;
    }
    if (!personId) return true;

    return !(await hasPersonUsedTrial(supabase, personId));
  } catch (err) {
    logger.warn("isTrialAvailableForCurrentUser failed, assuming available", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return true;
  }
}
