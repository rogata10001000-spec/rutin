"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Result } from "../types";

export type AdminFaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  active: boolean;
};

const faqContentSchema = z.object({
  question: z.string().trim().min(1, "質問を入力してください").max(200, "質問は200文字以内で入力してください"),
  answer: z.string().trim().min(1, "回答を入力してください").max(2000, "回答は2000文字以内で入力してください"),
});

function forbidden(): { ok: false; error: { code: "FORBIDDEN"; message: string } } {
  return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
}

/** 全FAQ（非表示含む）を並び順で取得（Admin）。 */
export async function getFaqItemsForAdmin(): Promise<Result<{ items: AdminFaqItem[] }>> {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("faq_items")
    .select("id, question, answer, sort_order, active")
    .order("sort_order", { ascending: true });

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "よくある質問を取得できませんでした" } };
  }

  const items: AdminFaqItem[] = (data ?? []).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    sortOrder: r.sort_order,
    active: r.active,
  }));

  return { ok: true, data: { items } };
}

/** FAQを追加（Admin）。末尾に追加され、確認してから表示できるよう既定は非表示。 */
export async function createFaqItem(input: {
  question: string;
  answer: string;
}): Promise<Result<{ item: AdminFaqItem }>> {
  const parsed = faqContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.issues[0]?.message ?? "入力内容を確認してください" },
    };
  }
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const supabase = createAdminSupabaseClient();

  // 並び順は「既存の最大 + 10」（行数ベースだと削除で歯抜けのとき既存と衝突する）
  const { data: last } = await supabase
    .from("faq_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("faq_items")
    .insert({
      question: parsed.data.question,
      answer: parsed.data.answer,
      sort_order: nextOrder,
      active: false,
      updated_by: admin.id,
    })
    .select("id, question, answer, sort_order, active")
    .single();

  if (error || !data) {
    logger.error("faq: create failed", { error: error?.message });
    return { ok: false, error: { code: "UNKNOWN", message: "追加できませんでした。もう一度お試しください" } };
  }

  return {
    ok: true,
    data: {
      item: {
        id: data.id,
        question: data.question,
        answer: data.answer,
        sortOrder: data.sort_order,
        active: data.active,
      },
    },
  };
}

/** FAQの内容・表示状態を更新（Admin）。 */
export async function updateFaqItem(input: {
  id: string;
  question: string;
  answer: string;
  active: boolean;
}): Promise<Result<{ id: string }>> {
  const parsed = faqContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: parsed.error.issues[0]?.message ?? "入力内容を確認してください" },
    };
  }
  if (!z.string().uuid().safeParse(input.id).success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("faq_items")
    .update({
      question: parsed.data.question,
      answer: parsed.data.answer,
      active: input.active,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "保存できませんでした。もう一度お試しください" } };
  }

  return { ok: true, data: { id: input.id } };
}

/** FAQを削除（Admin）。 */
export async function deleteFaqItem(id: string): Promise<Result<{ id: string }>> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("faq_items").delete().eq("id", id);

  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: "削除できませんでした。もう一度お試しください" } };
  }

  return { ok: true, data: { id } };
}

/** 並び順を1つ上/下と入れ替える（Admin）。 */
export async function moveFaqItem(input: {
  id: string;
  direction: "up" | "down";
}): Promise<Result<{ id: string }>> {
  if (!z.string().uuid().safeParse(input.id).success) {
    return { ok: false, error: { code: "ZOD_ERROR", message: "不正なリクエストです" } };
  }
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const supabase = createAdminSupabaseClient();

  const { data: items, error } = await supabase
    .from("faq_items")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !items) {
    return { ok: false, error: { code: "UNKNOWN", message: "並び替えできませんでした" } };
  }

  const index = items.findIndex((r) => r.id === input.id);
  const neighborIndex = input.direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighborIndex < 0 || neighborIndex >= items.length) {
    // 端での操作は何もしない（エラーにしない）
    return { ok: true, data: { id: input.id } };
  }

  const current = items[index];
  const neighbor = items[neighborIndex];
  const now = new Date().toISOString();

  const [r1, r2] = await Promise.all([
    supabase
      .from("faq_items")
      .update({ sort_order: neighbor.sort_order, updated_by: admin.id, updated_at: now })
      .eq("id", current.id),
    supabase
      .from("faq_items")
      .update({ sort_order: current.sort_order, updated_by: admin.id, updated_at: now })
      .eq("id", neighbor.id),
  ]);

  if (r1.error || r2.error) {
    return { ok: false, error: { code: "UNKNOWN", message: "並び替えできませんでした" } };
  }

  return { ok: true, data: { id: input.id } };
}
