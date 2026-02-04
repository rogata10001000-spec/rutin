"use server";

import { revalidatePath } from "next/cache";
import { memoSchema } from "@/schemas/memos";
import { Result, toZodErrorMessage } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessUser } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

// メモカテゴリ定数
export const MEMO_CATEGORIES = [
  { value: "profile", label: "プロフィール" },
  { value: "ng", label: "NG事項" },
  { value: "resonance", label: "刺さる言葉" },
  { value: "other", label: "その他" },
] as const;

export type MemoCategory = typeof MEMO_CATEGORIES[number]["value"];

export type Memo = {
  id: string;
  endUserId: string;
  category: string;
  categoryLabel: string;
  pinned: boolean;
  body: string;
  updatedAt: string;
};

export type MemoRevision = {
  id: string;
  body: string;
  editedBy: string;
  editedByName: string;
  createdAt: string;
};

export type GetUserMemosResult = Result<{ memos: Memo[] }>;

/**
 * ユーザーのメモ一覧取得
 */
export async function getUserMemos(endUserId: string): Promise<GetUserMemosResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: memos, error } = await supabase
    .from("memos")
    .select("id, end_user_id, category, pinned, latest_body, updated_at")
    .eq("end_user_id", endUserId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メモの取得に失敗しました" },
    };
  }

  const items: Memo[] = (memos ?? []).map((m) => ({
    id: m.id,
    endUserId: m.end_user_id,
    category: m.category,
    categoryLabel: MEMO_CATEGORIES.find((c) => c.value === m.category)?.label ?? m.category,
    pinned: m.pinned,
    body: m.latest_body,
    updatedAt: m.updated_at,
  }));

  return { ok: true, data: { memos: items } };
}

export type GetMemoRevisionsResult = Result<{ revisions: MemoRevision[] }>;

/**
 * メモの編集履歴取得
 */
export async function getMemoRevisions(memoId: string): Promise<GetMemoRevisionsResult> {
  const supabase = await createServerSupabaseClient();

  // メモの所有者を確認してアクセス権チェック
  const { data: memo, error: memoError } = await supabase
    .from("memos")
    .select("end_user_id")
    .eq("id", memoId)
    .single();

  if (memoError || !memo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "メモが見つかりません" },
    };
  }

  const access = await canAccessUser(memo.end_user_id);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const { data: revisions, error } = await supabase
    .from("memo_revisions")
    .select(`
      id,
      body,
      edited_by,
      created_at,
      staff_profiles!memo_revisions_edited_by_fkey (
        display_name
      )
    `)
    .eq("memo_id", memoId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "履歴の取得に失敗しました" },
    };
  }

  const items: MemoRevision[] = (revisions ?? []).map((r) => ({
    id: r.id,
    body: r.body,
    editedBy: r.edited_by,
    editedByName: (r.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? "不明",
    createdAt: r.created_at,
  }));

  return { ok: true, data: { revisions: items } };
}

export type UpsertMemoInput = {
  endUserId: string;
  category: string;
  pinned: boolean;
  body: string;
};

export type UpsertMemoResult = Result<{ memoId: string }>;

export type DeleteMemoInput = {
  memoId: string;
};

export type DeleteMemoResult = Result<{ success: boolean }>;

/**
 * メモ追加/更新
 * 権限: Admin/Supervisor/Cast（担当）
 */
export async function upsertMemo(input: UpsertMemoInput): Promise<UpsertMemoResult> {
  // Zodバリデーション
  const parsed = memoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // 権限チェック
  const access = await canAccessUser(parsed.data.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 既存メモ検索（同一end_user_id + category）
  const { data: existingMemo } = await supabase
    .from("memos")
    .select("id, latest_body, pinned")
    .eq("end_user_id", parsed.data.endUserId)
    .eq("category", parsed.data.category)
    .single();

  let memoId: string;
  let action: "UPSERT_MEMO" | "PIN_MEMO" = "UPSERT_MEMO";
  let beforeData: Record<string, unknown> | undefined;

  if (existingMemo) {
    // 更新
    beforeData = {
      body: existingMemo.latest_body?.slice(0, 100),
      pinned: existingMemo.pinned,
    };
    memoId = existingMemo.id;

    const { error } = await supabase
      .from("memos")
      .update({
        latest_body: parsed.data.body,
        pinned: parsed.data.pinned,
      })
      .eq("id", memoId);

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "メモの更新に失敗しました" },
      };
    }

    // ピンの変更のみの場合は別アクション
    if (existingMemo.pinned !== parsed.data.pinned && existingMemo.latest_body === parsed.data.body) {
      action = "PIN_MEMO";
    }
  } else {
    // 新規作成
    const { data: newMemo, error } = await supabase
      .from("memos")
      .insert({
        end_user_id: parsed.data.endUserId,
        category: parsed.data.category,
        pinned: parsed.data.pinned,
        latest_body: parsed.data.body,
      })
      .select("id")
      .single();

    if (error || !newMemo) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "メモの作成に失敗しました" },
      };
    }

    memoId = newMemo.id;
  }

  // memo_revisions追加（履歴）
  const { error: revError } = await supabase.from("memo_revisions").insert({
    memo_id: memoId,
    body: parsed.data.body,
    edited_by: access.id,
  });

  if (revError) {
    console.error("[Memo] Failed to create revision:", revError);
  }

  // 監査ログ
  await writeAuditLog({
    action,
    targetType: "memos",
    targetId: memoId,
    success: true,
    metadata: buildAuditMetadata(
      {
        end_user_id: parsed.data.endUserId,
        category: parsed.data.category,
        pinned: parsed.data.pinned,
        body_length: parsed.data.body.length,
      },
      { before: beforeData }
    ),
  });

  revalidatePath(`/users/${parsed.data.endUserId}`);
  revalidatePath(`/chat/${parsed.data.endUserId}`);

  return { ok: true, data: { memoId } };
}

/**
 * メモ削除
 * 権限: Admin/Supervisor/Cast（担当）
 */
export async function deleteMemo(input: DeleteMemoInput): Promise<DeleteMemoResult> {
  const supabase = await createServerSupabaseClient();

  // メモの所有者を確認してアクセス権チェック
  const { data: memo, error: memoError } = await supabase
    .from("memos")
    .select("end_user_id, category, latest_body")
    .eq("id", input.memoId)
    .single();

  if (memoError || !memo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "メモが見つかりません" },
    };
  }

  const access = await canAccessUser(memo.end_user_id);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  // memo_revisionsを先に削除（外部キー制約）
  await supabase
    .from("memo_revisions")
    .delete()
    .eq("memo_id", input.memoId);

  // メモ削除
  const { error } = await supabase
    .from("memos")
    .delete()
    .eq("id", input.memoId);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "メモの削除に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "DELETE_MEMO",
    targetType: "memos",
    targetId: input.memoId,
    success: true,
    metadata: buildAuditMetadata({
      end_user_id: memo.end_user_id,
      category: memo.category,
      body_length: memo.latest_body?.length ?? 0,
    }),
  });

  revalidatePath(`/users/${memo.end_user_id}`);
  revalidatePath(`/chat/${memo.end_user_id}`);

  return { ok: true, data: { success: true } };
}

export type MarkBirthdayCongratulatedInput = {
  endUserId: string;
};

export type MarkBirthdayCongratulatedResult = Result<{ id: string }>;

export type BirthdayStatus = {
  isBirthdayToday: boolean;
  birthday: string | null;
  hasSentThisYear: boolean;
  sentByName?: string;
  sentAt?: string;
};

export type GetBirthdayStatusResult = Result<BirthdayStatus>;

/**
 * 誕生日お祝いステータス取得
 */
export async function getBirthdayStatus(endUserId: string): Promise<GetBirthdayStatusResult> {
  const access = await canAccessUser(endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // ユーザーの誕生日取得
  const { data: user } = await supabase
    .from("end_users")
    .select("birthday")
    .eq("id", endUserId)
    .single();

  if (!user?.birthday) {
    return {
      ok: true,
      data: {
        isBirthdayToday: false,
        birthday: null,
        hasSentThisYear: false,
      },
    };
  }

  // 今日の日付（JST）
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const isBirthdayToday = user.birthday.slice(5) === today.slice(5);

  // 今年の送信記録を確認
  const currentYear = parseInt(today.split("-")[0], 10);
  const { data: congrats } = await supabase
    .from("birthday_congrats")
    .select(`
      id,
      sent_at,
      staff_profiles!birthday_congrats_sent_by_fkey (
        display_name
      )
    `)
    .eq("end_user_id", endUserId)
    .eq("year", currentYear)
    .single();

  return {
    ok: true,
    data: {
      isBirthdayToday,
      birthday: user.birthday,
      hasSentThisYear: !!congrats,
      sentByName: congrats
        ? (congrats.staff_profiles as unknown as { display_name: string } | null)?.display_name
        : undefined,
      sentAt: congrats?.sent_at,
    },
  };
}

/**
 * 誕生日お祝い送信フラグを記録
 * 権限: Admin/Supervisor/Cast（担当）
 */
export async function markBirthdayCongratulated(
  input: MarkBirthdayCongratulatedInput
): Promise<MarkBirthdayCongratulatedResult> {
  // 権限チェック
  const access = await canAccessUser(input.endUserId);
  if (!access) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "このユーザーへのアクセス権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  // 今年（JST基準）
  const currentYear = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).split("-")[0];
  const year = parseInt(currentYear, 10);

  // 重複チェック（unique制約でも防止）
  const { data: existing } = await supabase
    .from("birthday_congrats")
    .select("id")
    .eq("end_user_id", input.endUserId)
    .eq("year", year)
    .single();

  if (existing) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "今年はすでにお祝いを送信済みです" },
    };
  }

  const { data, error } = await supabase
    .from("birthday_congrats")
    .insert({
      end_user_id: input.endUserId,
      year,
      sent_by: access.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "今年はすでにお祝いを送信済みです" },
      };
    }
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "誕生日フラグの記録に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "BIRTHDAY_SENT",
    targetType: "birthday_congrats",
    targetId: data.id,
    success: true,
    metadata: { end_user_id: input.endUserId, year },
  });

  revalidatePath(`/users/${input.endUserId}`);

  return { ok: true, data: { id: data.id } };
}
