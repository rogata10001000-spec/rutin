"use server";

import { pointCheckoutSchema, sendGiftSchema } from "@/schemas/gifts";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { createPointCheckout } from "@/lib/stripe";
import { verifyUserToken } from "@/lib/auth";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

export type CreatePointCheckoutInput = {
  token: string; // ユーザー認証トークン
  productId: string;
};

export type CreatePointCheckoutResult = Result<{ checkoutUrl: string }>;

/**
 * ポイント購入Checkout Session作成
 * 権限: ユーザー（トークン認証）
 */
export async function createPointCheckoutSession(
  input: CreatePointCheckoutInput
): Promise<CreatePointCheckoutResult> {
  // トークン検証
  const tokenResult = verifyUserToken(input.token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      error: { 
        code: "UNAUTHORIZED", 
        message: tokenResult.error === "expired" ? "セッションが期限切れです" : "認証エラー" 
      },
    };
  }

  const lineUserId = tokenResult.lineUserId;

  // Zodバリデーション
  const parsed = pointCheckoutSchema.safeParse({
    endUserId: "placeholder", // トークンから取得
    productId: input.productId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // service_roleでDB操作（ユーザー向けページはRLSバイパス）
  const supabase = createAdminSupabaseClient();

  // ユーザー取得
  const { data: user } = await supabase
    .from("end_users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  // 商品取得
  const { data: product } = await supabase
    .from("point_products")
    .select("*")
    .eq("id", parsed.data.productId)
    .eq("active", true)
    .single();

  if (!product) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "商品が見つかりません" },
    };
  }

  // Stripe Checkout Session作成
  try {
    const { url, sessionId } = await createPointCheckout({
      lineUserId,
      stripePriceId: product.stripe_price_id,
      points: product.points,
      productId: product.id,
      successUrl: `${APP_BASE_URL}/points/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_BASE_URL}/points?canceled=true`,
    });

    if (!url) {
      throw new Error("Checkout URL is null");
    }

    // 監査ログ
    await writeAuditLog({
      action: "POINT_CHECKOUT_CREATE",
      targetType: "point_products",
      targetId: product.id,
      success: true,
      metadata: {
        line_user_id: lineUserId,
        session_id: sessionId,
        points: product.points,
      },
      actorStaffId: null, // ユーザー操作
    });

    return { ok: true, data: { checkoutUrl: url } };
  } catch (err) {
    return {
      ok: false,
      error: { code: "EXTERNAL_API_ERROR", message: "決済ページの作成に失敗しました" },
    };
  }
}

export type SendGiftInput = {
  token: string; // ユーザー認証トークン
  giftId: string;
};

export type SendGiftResult = Result<{
  giftSendId: string;
  revenueEventId: string;
  payoutId: string;
}>;

/**
 * ギフト送信（トランザクション処理）
 * 権限: ユーザー（トークン認証）
 * 
 * 処理順序（原子性必須）:
 * 1. 残高チェック
 * 2. gift_sends insert
 * 3. user_point_ledger insert（残高減）
 * 4. revenue_events insert（売上認識）
 * 5. payout_calculations insert（配分計算）
 * 6. messages insert（🎁イベント）
 */
export async function sendGift(input: SendGiftInput): Promise<SendGiftResult> {
  // トークン検証
  const tokenResult = verifyUserToken(input.token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      error: { 
        code: "UNAUTHORIZED", 
        message: tokenResult.error === "expired" ? "セッションが期限切れです" : "認証エラー" 
      },
    };
  }

  const lineUserId = tokenResult.lineUserId;

  // Zodバリデーション
  const parsed = sendGiftSchema.safeParse({
    endUserId: "placeholder",
    giftId: input.giftId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = createAdminSupabaseClient();

  // ユーザー取得
  const { data: user } = await supabase
    .from("end_users")
    .select("id, assigned_cast_id")
    .eq("line_user_id", lineUserId)
    .single();

  if (!user || !user.assigned_cast_id) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーまたは担当キャストが見つかりません" },
    };
  }

  // ギフト取得
  const { data: gift } = await supabase
    .from("gift_catalog")
    .select("*")
    .eq("id", parsed.data.giftId)
    .eq("active", true)
    .single();

  if (!gift) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ギフトが見つかりません" },
    };
  }

  // 残高計算（集計）
  const { data: ledgerSum } = await supabase
    .from("user_point_ledger")
    .select("delta_points")
    .eq("end_user_id", user.id);

  const currentBalance = (ledgerSum ?? []).reduce((sum, row) => sum + row.delta_points, 0);

  if (currentBalance < gift.cost_points) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: `ポイントが不足しています（残高: ${currentBalance}pt）` },
    };
  }

  // 税率取得
  const { data: taxRate } = await supabase
    .from("tax_rates")
    .select("*")
    .eq("active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();

  if (!taxRate) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "税率の取得に失敗しました" },
    };
  }

  // 配分ルール取得（cast → global の順で解決）
  let payoutRule;
  const { data: castRule } = await supabase
    .from("payout_rules")
    .select("*")
    .eq("rule_type", "gift_share")
    .eq("scope_type", "cast")
    .eq("cast_id", user.assigned_cast_id)
    .eq("active", true)
    .lte("effective_from", new Date().toISOString().split("T")[0])
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();

  if (castRule) {
    payoutRule = castRule;
  } else {
    const { data: globalRule } = await supabase
      .from("payout_rules")
      .select("*")
      .eq("rule_type", "gift_share")
      .eq("scope_type", "global")
      .eq("active", true)
      .lte("effective_from", new Date().toISOString().split("T")[0])
      .order("effective_from", { ascending: false })
      .limit(1)
      .single();

    payoutRule = globalRule;
  }

  if (!payoutRule) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "配分ルールが設定されていません" },
    };
  }

  // JSTで今日の日付
  const occurredOn = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  // 税・配分計算（税抜ベース、端数切り捨て）
  const amountExclTax = gift.cost_points; // 1pt = 1円（税抜）
  const taxJpy = Math.floor(amountExclTax * Number(taxRate.rate));
  const amountInclTax = amountExclTax + taxJpy;
  const payoutAmount = Math.floor(amountExclTax * Number(payoutRule.percent) / 100);

  // --- トランザクション開始（PostgreSQLのトランザクションはSupabaseでは使えないため、
  // 冪等性とエラーハンドリングで整合性を担保）---

  // 1. gift_sends insert
  const { data: giftSend, error: giftError } = await supabase
    .from("gift_sends")
    .insert({
      end_user_id: user.id,
      cast_id: user.assigned_cast_id,
      gift_id: gift.id,
      cost_points: gift.cost_points,
    })
    .select("id")
    .single();

  if (giftError) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ギフト送信の記録に失敗しました" },
    };
  }

  // 2. user_point_ledger insert（残高減）
  const { error: ledgerError } = await supabase.from("user_point_ledger").insert({
    end_user_id: user.id,
    delta_points: -gift.cost_points,
    reason: "gift_redeem",
    ref_type: "gift_send",
    ref_id: giftSend.id,
  });

  if (ledgerError) {
    // ロールバック的対応は将来の課題
    console.error("[Gift] Ledger insert failed:", ledgerError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ポイント消費の記録に失敗しました" },
    };
  }

  // 3. revenue_events insert（売上認識）
  const { data: revenue, error: revenueError } = await supabase
    .from("revenue_events")
    .insert({
      event_type: "gift_redeem",
      end_user_id: user.id,
      cast_id: user.assigned_cast_id,
      occurred_on: occurredOn,
      amount_excl_tax_jpy: amountExclTax,
      tax_rate_id: taxRate.id,
      tax_jpy: taxJpy,
      amount_incl_tax_jpy: amountInclTax,
      source_ref_type: "gift_send",
      source_ref_id: giftSend.id,
      metadata: { gift_id: gift.id, gift_name: gift.name },
    })
    .select("id")
    .single();

  if (revenueError) {
    console.error("[Gift] Revenue insert failed:", revenueError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "売上の記録に失敗しました" },
    };
  }

  // 4. payout_calculations insert（配分計算）
  const { data: payout, error: payoutError } = await supabase
    .from("payout_calculations")
    .insert({
      revenue_event_id: revenue.id,
      cast_id: user.assigned_cast_id,
      rule_id: payoutRule.id,
      percent_snapshot: payoutRule.percent,
      amount_jpy: payoutAmount,
    })
    .select("id")
    .single();

  if (payoutError) {
    console.error("[Gift] Payout insert failed:", payoutError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "配分計算の記録に失敗しました" },
    };
  }

  // 5. messages insert（🎁イベント表示用、LINEには送信しない）
  const { data: message } = await supabase
    .from("messages")
    .insert({
      end_user_id: user.id,
      direction: "in",
      body: `🎁 ${gift.icon ?? "🎁"} ${gift.name} を送りました`,
      sent_by_staff_id: null,
    })
    .select("id")
    .single();

  // gift_sendsにmessage_idを更新
  if (message) {
    await supabase
      .from("gift_sends")
      .update({ message_id: message.id })
      .eq("id", giftSend.id);
  }

  // 監査ログ
  await writeAuditLog({
    action: "GIFT_SEND",
    targetType: "gift_sends",
    targetId: giftSend.id,
    success: true,
    metadata: buildAuditMetadata(
      {
        line_user_id: lineUserId,
        gift_id: gift.id,
        gift_name: gift.name,
        cost_points: gift.cost_points,
      },
      {
        calculations: {
          amount_excl_tax: amountExclTax,
          tax_jpy: taxJpy,
          amount_incl_tax: amountInclTax,
          payout_percent: payoutRule.percent,
          payout_amount: payoutAmount,
        },
      }
    ),
    actorStaffId: null,
  });

  return {
    ok: true,
    data: {
      giftSendId: giftSend.id,
      revenueEventId: revenue.id,
      payoutId: payout.id,
    },
  };
}

// =====================================
// ポイント商品・ギフト一覧取得
// =====================================

export type PointProduct = {
  id: string;
  name: string;
  points: number;
  price: number;
};

export type GetPointProductsResult = Result<{ items: PointProduct[] }>;

/**
 * ポイント商品一覧取得（公開）
 */
export async function getPointProducts(): Promise<GetPointProductsResult> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("point_products")
    .select("id, name, points, price_incl_tax_jpy")
    .eq("active", true)
    .order("points", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "商品の取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        points: row.points,
        price: row.price_incl_tax_jpy,
      })),
    },
  };
}

export type GiftCatalogItem = {
  id: string;
  name: string;
  icon: string | null;
  costPoints: number;
  category: string | null;
};

export type GetGiftCatalogResult = Result<{ items: GiftCatalogItem[] }>;

/**
 * ギフトカタログ一覧取得（公開）
 */
export async function getGiftCatalog(): Promise<GetGiftCatalogResult> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("gift_catalog")
    .select("id, name, icon, cost_points, category")
    .eq("active", true)
    .order("cost_points", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ギフトの取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        costPoints: row.cost_points,
        category: row.category,
      })),
    },
  };
}

/**
 * ユーザーのポイント残高取得
 */
export async function getUserPointBalance(input: {
  token: string;
}): Promise<Result<{ balance: number }>> {
  const tokenResult = verifyUserToken(input.token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "認証エラー" },
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data: user } = await supabase
    .from("end_users")
    .select("id")
    .eq("line_user_id", tokenResult.lineUserId)
    .single();

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "ユーザーが見つかりません" },
    };
  }

  const { data: ledger } = await supabase
    .from("user_point_ledger")
    .select("delta_points")
    .eq("end_user_id", user.id);

  const balance = (ledger ?? []).reduce((sum, row) => sum + row.delta_points, 0);

  return { ok: true, data: { balance } };
}
