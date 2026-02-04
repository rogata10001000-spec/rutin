"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "../types";
import { upsertTaxRateSchema, type UpsertTaxRateInput } from "@/schemas/tax-rates";
import { writeAuditLog } from "@/lib/audit";

export type TaxRate = {
  id: string;
  name: string;
  rate: number;
  effectiveFrom: string;
  active: boolean;
};

export type GetTaxRatesResult = Result<{ items: TaxRate[] }>;

/**
 * 税率一覧取得
 */
export async function getTaxRates(): Promise<GetTaxRatesResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: taxRates, error } = await supabase
    .from("tax_rates")
    .select("id, name, rate, effective_from, active")
    .order("effective_from", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const items: TaxRate[] = (taxRates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    rate: t.rate,
    effectiveFrom: t.effective_from,
    active: t.active,
  }));

  return { ok: true, data: { items } };
}

export type UpsertTaxRateResult = Result<{ id: string }>;

/**
 * 税率作成/更新
 */
export async function upsertTaxRate(
  input: UpsertTaxRateInput
): Promise<UpsertTaxRateResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // Admin権限チェック
  if (auth.role !== "admin") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "税率管理はAdminのみ可能です" },
    };
  }

  const parsed = upsertTaxRateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.errors[0]?.message ?? "入力内容を確認してください" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { id, name, rate, effectiveFrom, active } = parsed.data;

  let resultId: string;
  let action: "TAX_RATE_CREATE" | "TAX_RATE_UPDATE";

  if (id) {
    // 更新
    const { data, error } = await supabase
      .from("tax_rates")
      .update({
        name,
        rate,
        effective_from: effectiveFrom,
        active,
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "更新に失敗しました" },
      };
    }

    resultId = data.id;
    action = "TAX_RATE_UPDATE";
  } else {
    // 新規作成
    const { data, error } = await supabase
      .from("tax_rates")
      .insert({
        name,
        rate,
        effective_from: effectiveFrom,
        active,
      })
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "作成に失敗しました" },
      };
    }

    resultId = data.id;
    action = "TAX_RATE_CREATE";
  }

  // 監査ログ
  await writeAuditLog({
    action,
    targetType: "tax_rates",
    targetId: resultId,
    success: true,
    metadata: {
      name,
      rate,
      effective_from: effectiveFrom,
      active,
    },
  });

  return { ok: true, data: { id: resultId } };
}

export type ToggleTaxRateActiveResult = Result<{ id: string }>;

/**
 * 税率の有効/無効切り替え
 */
export async function toggleTaxRateActive(
  id: string
): Promise<ToggleTaxRateActiveResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth || auth.role !== "admin") {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "税率管理はAdminのみ可能です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("tax_rates")
    .select("active")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "税率が見つかりません" },
    };
  }

  const { error } = await supabase
    .from("tax_rates")
    .update({ active: !current.active })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "TAX_RATE_UPDATE",
    targetType: "tax_rates",
    targetId: id,
    success: true,
    metadata: { active: !current.active },
  });

  return { ok: true, data: { id } };
}
