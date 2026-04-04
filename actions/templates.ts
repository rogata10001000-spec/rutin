"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { Result } from "./types";

export type MessageTemplate = {
  id: string;
  category: string;
  title: string;
  body: string;
  isGlobal: boolean;
  staffId: string | null;
};

export type GetTemplatesResult = Result<{ templates: MessageTemplate[] }>;

/**
 * メッセージテンプレート一覧取得
 */
export async function getMessageTemplates(): Promise<GetTemplatesResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("message_templates")
    .select("id, category, title, body, is_global, staff_id")
    .or(`is_global.eq.true,staff_id.eq.${staff.id}`)
    .order("category")
    .order("sort_order");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "テンプレートの取得に失敗しました" },
    };
  }

  const templates: MessageTemplate[] = (data ?? []).map((t) => ({
    id: t.id,
    category: t.category,
    title: t.title,
    body: t.body,
    isGlobal: t.is_global,
    staffId: t.staff_id,
  }));

  return { ok: true, data: { templates } };
}

export type SaveTemplateInput = {
  id?: string;
  category: string;
  title: string;
  body: string;
  isGlobal?: boolean;
};

export type SaveTemplateResult = Result<{ templateId: string }>;

/**
 * テンプレート保存（新規/更新）
 */
export async function saveMessageTemplate(
  input: SaveTemplateInput
): Promise<SaveTemplateResult> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  if (!input.title.trim() || !input.body.trim() || !input.category.trim()) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "カテゴリ、タイトル、本文を入力してください" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const isGlobal = input.isGlobal && (staff.role === "admin");

  if (input.id) {
    const { error } = await supabase
      .from("message_templates")
      .update({
        category: input.category.trim(),
        title: input.title.trim(),
        body: input.body.trim(),
        is_global: isGlobal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "テンプレートの更新に失敗しました" },
      };
    }

    return { ok: true, data: { templateId: input.id } };
  }

  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      category: input.category.trim(),
      title: input.title.trim(),
      body: input.body.trim(),
      staff_id: staff.id,
      is_global: isGlobal,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "テンプレートの保存に失敗しました" },
    };
  }

  return { ok: true, data: { templateId: data.id } };
}
