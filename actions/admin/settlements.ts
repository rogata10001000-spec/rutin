"use server";

import { revalidatePath } from "next/cache";
import { settlementPeriodSchema } from "@/schemas/settlements";
import { Result, toZodErrorMessage } from "../types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
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

  const supabase = createAdminSupabaseClient();

  const { data: batchId, error: batchError } = await (supabase as any).rpc(
    "create_settlement_batch_atomic",
    {
      p_period_from: input.periodFrom,
      p_period_to: input.periodTo,
      p_created_by: admin.id,
    }
  );

  if (batchError?.code === "P0002" || batchError?.message?.includes("NO_SETTLEMENT_TARGETS")) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "対象期間に精算対象がありません" },
    };
  }

  if (batchError?.code === "40001" || batchError?.message?.includes("SETTLEMENT_TARGET_CHANGED")) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "精算対象が更新されました。再度作成してください" },
    };
  }

  if (batchError || !batchId) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "バッチの作成に失敗しました" },
    };
  }

  const { data: batch } = await supabase
    .from("settlement_batches")
    .select("total_amount_jpy")
    .eq("id", batchId as string)
    .single();

  await writeAuditLog({
    action: "SETTLEMENT_BATCH_CREATE",
    targetType: "settlement_batches",
    targetId: batchId as string,
    success: true,
    metadata: buildAuditMetadata({
      period_from: input.periodFrom,
      period_to: input.periodTo,
      total_amount_jpy: batch?.total_amount_jpy ?? 0,
    }),
  });

  revalidatePath("/admin/settlements");

  return { ok: true, data: { batchId: batchId as string } };
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
      approved_by: admin.id,
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
