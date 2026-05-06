"use server";

import { pointCheckoutSchema, sendGiftSchema } from "@/schemas/gifts";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";
import { createPointCheckout } from "@/lib/stripe";
import { verifyUserToken, getUserFromServerCookies } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

const APP_BASE_URL = getServerEnv().APP_BASE_URL;

async function resolveUserToken(token?: string) {
  const cookieUser = await getUserFromServerCookies();
  if (cookieUser.ok) return cookieUser;
  if (token) return verifyUserToken(token);
  return cookieUser;
}

export type CreatePointCheckoutInput = {
  token?: string; // 互換性維持用（Cookie優先）
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
  const tokenResult = await resolveUserToken(input.token);
  if (!tokenResult.ok) {
    const isExpired = "error" in tokenResult && tokenResult.error === "expired";
    return {
      ok: false,
      error: { 
        code: "UNAUTHORIZED", 
        message: isExpired ? "セッションが期限切れです" : "認証エラー" 
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
  token?: string; // 互換性維持用（Cookie優先）
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
  const tokenResult = await resolveUserToken(input.token);
  if (!tokenResult.ok) {
    const isExpired = "error" in tokenResult && tokenResult.error === "expired";
    return {
      ok: false,
      error: { 
        code: "UNAUTHORIZED", 
        message: isExpired ? "セッションが期限切れです" : "認証エラー" 
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
  const { data: rpcResult, error } = await (supabase as any).rpc("send_gift_atomic", {
    p_line_user_id: lineUserId,
    p_gift_id: parsed.data.giftId,
  });

  const rows = (rpcResult as any[]) ?? [];
  if (error || !rows[0]) {
    const message = error?.message ?? "ギフト送信の処理に失敗しました";
    if (message.includes("INSUFFICIENT_BALANCE")) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "ポイントが不足しています" },
      };
    }
    if (message.includes("GIFT_NOT_FOUND")) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "ギフトが見つかりません" },
      };
    }
    if (message.includes("USER_OR_CAST_NOT_FOUND")) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "ユーザーまたは担当メイトが見つかりません" },
      };
    }
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "ギフト送信に失敗しました" },
    };
  }

  const row = rows[0];

  // 監査ログ
  await writeAuditLog({
    action: "GIFT_SEND",
    targetType: "gift_sends",
    targetId: row.gift_send_id,
    success: true,
    metadata: buildAuditMetadata(
      {
        line_user_id: lineUserId,
        gift_id: parsed.data.giftId,
        gift_name: row.gift_name,
        cost_points: row.cost_points,
      },
      {
        calculations: {
          amount_excl_tax: row.amount_excl_tax,
          tax_jpy: row.tax_jpy,
          amount_incl_tax: row.amount_incl_tax,
          payout_percent: row.payout_percent,
        },
      }
    ),
    actorStaffId: null,
  });

  return {
    ok: true,
    data: {
      giftSendId: row.gift_send_id,
      revenueEventId: row.revenue_event_id,
      payoutId: row.payout_id,
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
export async function getUserPointBalance(input?: {
  token?: string;
}): Promise<Result<{ balance: number }>> {
  const tokenResult = await resolveUserToken(input?.token);
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
