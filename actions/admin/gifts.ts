"use server";

import { revalidatePath } from "next/cache";
import { upsertGiftCatalogSchema, upsertPointProductSchema } from "@/schemas/gifts";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// =====================================
// ギフトカタログ一覧取得
// =====================================

export type GiftCatalogAdmin = {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
  costPoints: number;
  sortOrder: number;
  active: boolean;
};

export type GetGiftCatalogAdminResult = Result<{ items: GiftCatalogAdmin[] }>;

/**
 * ギフトカタログ一覧取得（管理用）
 */
export async function getGiftCatalogAdmin(): Promise<GetGiftCatalogAdminResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("gift_catalog")
    .select("id, name, icon, category, cost_points, sort_order, active")
    .order("sort_order")
    .order("cost_points");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        category: row.category,
        costPoints: row.cost_points,
        sortOrder: row.sort_order ?? 0,
        active: row.active,
      })),
    },
  };
}

// =====================================
// ギフトカタログ更新
// =====================================

export type UpsertGiftCatalogInput = {
  id?: string;
  name: string;
  category: string;
  costPoints: number;
  active: boolean;
  sortOrder?: number;
  icon?: string | null;
};

export type UpsertGiftCatalogResult = Result<{ id: string }>;

/**
 * ギフトカタログ作成/更新
 */
export async function upsertGiftCatalog(
  input: UpsertGiftCatalogInput
): Promise<UpsertGiftCatalogResult> {
  // Zodバリデーション
  const parsed = upsertGiftCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const data = parsed.data;

  if (data.id) {
    // 更新
    const { error } = await supabase
      .from("gift_catalog")
      .update({
        name: data.name,
        category: data.category,
        cost_points: data.costPoints,
        active: data.active,
        sort_order: data.sortOrder ?? 0,
        icon: data.icon,
      })
      .eq("id", data.id);

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "更新に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "GIFT_CATALOG_UPDATE",
      targetType: "gift_catalog",
      targetId: data.id,
      success: true,
      metadata: buildAuditMetadata(data),
    });

    revalidatePath("/admin/gifts");

    return { ok: true, data: { id: data.id } };
  } else {
    // 新規作成
    const { data: inserted, error } = await supabase
      .from("gift_catalog")
      .insert({
        name: data.name,
        category: data.category,
        cost_points: data.costPoints,
        active: data.active,
        sort_order: data.sortOrder ?? 0,
        icon: data.icon,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "作成に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "GIFT_CATALOG_CREATE",
      targetType: "gift_catalog",
      targetId: inserted.id,
      success: true,
      metadata: buildAuditMetadata(data),
    });

    revalidatePath("/admin/gifts");

    return { ok: true, data: { id: inserted.id } };
  }
}

// =====================================
// ポイント商品一覧取得
// =====================================

export type PointProductAdmin = {
  id: string;
  name: string;
  points: number;
  priceExclTaxJpy: number;
  priceInclTaxJpy: number;
  taxRateId: string;
  stripePriceId: string;
  active: boolean;
};

export type GetPointProductsAdminResult = Result<{ items: PointProductAdmin[] }>;

/**
 * ポイント商品一覧取得（管理用）
 */
export async function getPointProductsAdmin(): Promise<GetPointProductsAdminResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("point_products")
    .select("id, name, points, price_excl_tax_jpy, price_incl_tax_jpy, tax_rate_id, stripe_price_id, active")
    .order("points");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  return {
    ok: true,
    data: {
      items: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        points: row.points,
        priceExclTaxJpy: row.price_excl_tax_jpy,
        priceInclTaxJpy: row.price_incl_tax_jpy,
        taxRateId: row.tax_rate_id,
        stripePriceId: row.stripe_price_id,
        active: row.active,
      })),
    },
  };
}

// =====================================
// ポイント商品更新
// =====================================

export type UpsertPointProductInput = {
  id?: string;
  name: string;
  points: number;
  priceInclTaxJpy: number;
  taxRateId?: string;
  stripePriceId: string;
  active: boolean;
};

export type UpsertPointProductResult = Result<{ id: string }>;

/**
 * ポイント商品作成/更新
 */
export async function upsertPointProduct(
  input: UpsertPointProductInput
): Promise<UpsertPointProductResult> {
  // Zodバリデーション
  const parsed = upsertPointProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const data = parsed.data;

  // 税率を取得（指定がない場合はデフォルト税率）
  let taxRateId = data.taxRateId;
  let taxRate = 0.1; // デフォルト10%

  if (taxRateId) {
    const { data: rate } = await supabase
      .from("tax_rates")
      .select("rate")
      .eq("id", taxRateId)
      .single();
    if (rate) {
      taxRate = Number(rate.rate);
    }
  } else {
    // デフォルト税率を取得
    const { data: defaultRate } = await supabase
      .from("tax_rates")
      .select("id, rate")
      .eq("active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .single();
    
    if (defaultRate) {
      taxRateId = defaultRate.id;
      taxRate = Number(defaultRate.rate);
    } else {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "有効な税率が見つかりません" },
      };
    }
  }

  // 税抜価格を計算（税込価格 / (1 + 税率)）
  const priceExclTaxJpy = Math.round(data.priceInclTaxJpy / (1 + taxRate));

  if (data.id) {
    // 更新
    const { error } = await supabase
      .from("point_products")
      .update({
        name: data.name,
        points: data.points,
        price_excl_tax_jpy: priceExclTaxJpy,
        tax_rate_id: taxRateId,
        price_incl_tax_jpy: data.priceInclTaxJpy,
        stripe_price_id: data.stripePriceId,
        active: data.active,
      })
      .eq("id", data.id);

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "更新に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "POINT_PRODUCT_UPDATE",
      targetType: "point_products",
      targetId: data.id,
      success: true,
      metadata: buildAuditMetadata({
        ...data,
        price_excl_tax_jpy: priceExclTaxJpy,
        tax_rate_id: taxRateId,
      }),
    });

    revalidatePath("/admin/gifts");

    return { ok: true, data: { id: data.id } };
  } else {
    // 新規作成
    const { data: inserted, error } = await supabase
      .from("point_products")
      .insert({
        name: data.name,
        points: data.points,
        price_excl_tax_jpy: priceExclTaxJpy,
        tax_rate_id: taxRateId,
        price_incl_tax_jpy: data.priceInclTaxJpy,
        stripe_price_id: data.stripePriceId,
        active: data.active,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "作成に失敗しました" },
      };
    }

    await writeAuditLog({
      action: "POINT_PRODUCT_CREATE",
      targetType: "point_products",
      targetId: inserted.id,
      success: true,
      metadata: buildAuditMetadata({
        ...data,
        price_excl_tax_jpy: priceExclTaxJpy,
        tax_rate_id: taxRateId,
      }),
    });

    revalidatePath("/admin/gifts");

    return { ok: true, data: { id: inserted.id } };
  }
}
