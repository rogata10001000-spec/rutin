"use server";

import { revalidatePath } from "next/cache";
import { settlementPeriodSchema } from "@/schemas/settlements";
import { Result, toZodErrorMessage } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// =====================================
// 精算バッチ一覧取得
// =====================================

export type SettlementBatch = {
  id: string;
  periodFrom: string;
  periodTo: string;
  status: "draft" | "approved" | "paid";
  totalAmount: number;
  castCount: number;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
};

export type GetSettlementBatchesResult = Result<{ items: SettlementBatch[] }>;

/**
 * 精算バッチ一覧取得
 */
export async function getSettlementBatches(): Promise<GetSettlementBatchesResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("settlement_batches")
    .select(`
      id,
      period_from,
      period_to,
      status,
      total_amount_jpy,
      created_at,
      approved_at,
      paid_at
    `)
    .order("period_to", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  // 各バッチのキャスト数を取得
  const items: SettlementBatch[] = await Promise.all(
    (data ?? []).map(async (row) => {
      const { count } = await supabase
        .from("settlement_items")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", row.id);

      return {
        id: row.id,
        periodFrom: row.period_from,
        periodTo: row.period_to,
        status: row.status as "draft" | "approved" | "paid",
        totalAmount: row.total_amount_jpy ?? 0,
        castCount: count ?? 0,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        paidAt: row.paid_at,
      };
    })
  );

  return { ok: true, data: { items } };
}

// =====================================
// 精算バッチ詳細取得
// =====================================

export type SettlementItem = {
  id: string;
  castId: string;
  castName: string;
  amount: number;
  breakdown: Record<string, number>;
  calculationCount: number;
};

export type GetSettlementBatchDetailInput = {
  batchId: string;
};

export type GetSettlementBatchDetailResult = Result<{
  batch: SettlementBatch;
  items: SettlementItem[];
}>;

/**
 * 精算バッチ詳細取得
 */
export async function getSettlementBatchDetail(
  input: GetSettlementBatchDetailInput
): Promise<GetSettlementBatchDetailResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: batch, error: batchError } = await supabase
    .from("settlement_batches")
    .select("*")
    .eq("id", input.batchId)
    .single();

  if (batchError || !batch) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "バッチが見つかりません" },
    };
  }

  const { data: items } = await supabase
    .from("settlement_items")
    .select(`
      id,
      cast_id,
      amount_jpy,
      breakdown,
      staff_profiles!settlement_items_cast_id_fkey (
        display_name
      )
    `)
    .eq("batch_id", input.batchId)
    .order("amount_jpy", { ascending: false });

  return {
    ok: true,
    data: {
      batch: {
        id: batch.id,
        periodFrom: batch.period_from,
        periodTo: batch.period_to,
        status: batch.status as "draft" | "approved" | "paid",
        totalAmount: batch.total_amount_jpy ?? 0,
        castCount: items?.length ?? 0,
        createdAt: batch.created_at,
        approvedAt: batch.approved_at,
        paidAt: batch.paid_at,
      },
      items: (items ?? []).map((item) => {
        const breakdown = (item.breakdown as Record<string, number>) ?? {};
        return {
          id: item.id,
          castId: item.cast_id,
          castName: (item.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? "不明",
          amount: item.amount_jpy,
          breakdown,
          calculationCount: Object.keys(breakdown).length,
        };
      }),
    },
  };
}

// =====================================
// 精算バッチ作成
// =====================================

export type CreateSettlementBatchInput = {
  periodFrom: string;
  periodTo: string;
};

export type CreateSettlementBatchResult = Result<{ batchId: string }>;

/**
 * 精算バッチ作成
 */
export async function createSettlementBatch(
  input: CreateSettlementBatchInput
): Promise<CreateSettlementBatchResult> {
  const parsed = settlementPeriodSchema.safeParse({
    from: input.periodFrom,
    to: input.periodTo,
  });
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

  // 期間内のpayout_calculationsを集計（settlement_batch_idがnullのもの）
  const { data: calculations } = await supabase
    .from("payout_calculations")
    .select(`
      id,
      cast_id,
      amount_jpy,
      revenue_events!inner (
        occurred_on
      )
    `)
    .is("settlement_batch_id", null)
    .gte("revenue_events.occurred_on", input.periodFrom)
    .lte("revenue_events.occurred_on", input.periodTo);

  if (!calculations || calculations.length === 0) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "対象期間に精算対象がありません" },
    };
  }

  // キャスト別に集計
  const castTotals = new Map<string, { amount: number; count: number }>();
  for (const calc of calculations) {
    const current = castTotals.get(calc.cast_id) ?? { amount: 0, count: 0 };
    castTotals.set(calc.cast_id, {
      amount: current.amount + calc.amount_jpy,
      count: current.count + 1,
    });
  }

  const totalAmount = Array.from(castTotals.values()).reduce(
    (sum, t) => sum + t.amount,
    0
  );

  // バッチ作成
  const { data: batch, error: batchError } = await supabase
    .from("settlement_batches")
    .insert({
      period_from: input.periodFrom,
      period_to: input.periodTo,
      status: "draft",
      total_amount_jpy: totalAmount,
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "バッチの作成に失敗しました" },
    };
  }

  // 明細作成
  const itemInserts = Array.from(castTotals.entries()).map(([castId, data]) => ({
    batch_id: batch.id,
    cast_id: castId,
    amount_jpy: data.amount,
    breakdown: { calculation_count: data.count },
  }));

  const { error: itemError } = await supabase.from("settlement_items").insert(itemInserts);
  if (itemError) {
    console.error("settlement_items insert error:", itemError);
  }

  // payout_calculationsにbatch_idを設定
  const calcIds = calculations.map((c) => c.id);
  await supabase
    .from("payout_calculations")
    .update({ settlement_batch_id: batch.id })
    .in("id", calcIds);

  await writeAuditLog({
    action: "SETTLEMENT_BATCH_CREATE",
    targetType: "settlement_batches",
    targetId: batch.id,
    success: true,
    metadata: buildAuditMetadata({
      period_from: input.periodFrom,
      period_to: input.periodTo,
      total_amount_jpy: totalAmount,
      cast_count: castTotals.size,
    }),
  });

  revalidatePath("/admin/settlements");

  return { ok: true, data: { batchId: batch.id } };
}

// =====================================
// 精算バッチ承認
// =====================================

export type ApproveSettlementBatchInput = {
  batchId: string;
};

export type ApproveSettlementBatchResult = Result<{ batchId: string }>;

/**
 * 精算バッチ承認
 */
export async function approveSettlementBatch(
  input: ApproveSettlementBatchInput
): Promise<ApproveSettlementBatchResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 現在のステータス確認
  const { data: batch } = await supabase
    .from("settlement_batches")
    .select("status")
    .eq("id", input.batchId)
    .single();

  if (!batch) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "バッチが見つかりません" },
    };
  }

  if (batch.status !== "draft") {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "下書き状態のバッチのみ承認できます" },
    };
  }

  const { error } = await supabase
    .from("settlement_batches")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", input.batchId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "承認に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "SETTLEMENT_BATCH_APPROVE",
    targetType: "settlement_batches",
    targetId: input.batchId,
    success: true,
    metadata: {},
  });

  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${input.batchId}`);

  return { ok: true, data: { batchId: input.batchId } };
}

// =====================================
// 精算バッチ支払完了
// =====================================

export type MarkSettlementBatchPaidInput = {
  batchId: string;
};

export type MarkSettlementBatchPaidResult = Result<{ batchId: string }>;

/**
 * 精算バッチ支払完了
 */
export async function markSettlementBatchPaid(
  input: MarkSettlementBatchPaidInput
): Promise<MarkSettlementBatchPaidResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "管理者権限が必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 現在のステータス確認
  const { data: batch } = await supabase
    .from("settlement_batches")
    .select("status")
    .eq("id", input.batchId)
    .single();

  if (!batch) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "バッチが見つかりません" },
    };
  }

  if (batch.status !== "approved") {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "承認済みのバッチのみ支払完了にできます" },
    };
  }

  const { error } = await supabase
    .from("settlement_batches")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", input.batchId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  await writeAuditLog({
    action: "SETTLEMENT_BATCH_PAID",
    targetType: "settlement_batches",
    targetId: input.batchId,
    success: true,
    metadata: {},
  });

  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${input.batchId}`);

  return { ok: true, data: { batchId: input.batchId } };
}
