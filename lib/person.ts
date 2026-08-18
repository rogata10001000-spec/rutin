import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import { pickRelationshipRow, type RelationshipRow } from "@/lib/relationship-routing";
import { endUserNicknameFromLineId } from "@/lib/line-onboarding";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * 「人（person）」と「関係行（end_users）」の解決を1箇所に集約する。
 *
 * 複数メイト契約に対応したことで、同じ LINE UID に end_users の行が複数ありうる。
 * `.eq("line_user_id", uid).maybeSingle()` は行が増えた瞬間に静かに壊れる
 * （PostgRESTは複数行で maybeSingle がエラーになる／single は行を取り違える）ため、
 * UIDから行を引く処理はすべてこのモジュールを通す。
 *
 * 用語:
 *   person       … 人。LTV・トライアル権・ログインの単位
 *   関係行        … その人とあるメイトとの関係（= 1契約 = 1トーク）。end_users の1行
 *   見込み行      … まだどのメイトとも契約していない関係行（assigned_cast_id is null）
 */

/** ライブ（課金が生きている）とみなす契約状態 */
export const LIVE_SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "paused"] as const;

export type PersonRelationship = {
  endUserId: string;
  personId: string;
  lineUserId: string | null;
  assignedCastId: string | null;
  primaryLineAccountId: string | null;
  status: string;
  planCode: string;
  nickname: string;
  lineProfileSyncedAt: string | null;
  createdAt: string;
};

const RELATIONSHIP_COLUMNS =
  "id, person_id, line_user_id, assigned_cast_id, primary_line_account_id, status, plan_code, nickname, line_profile_synced_at, created_at";

type RawRelationshipRow = {
  id: string;
  person_id: string;
  line_user_id: string | null;
  assigned_cast_id: string | null;
  primary_line_account_id: string | null;
  status: string;
  plan_code: string;
  nickname: string;
  line_profile_synced_at: string | null;
  created_at: string;
};

function toRelationship(row: RawRelationshipRow): PersonRelationship {
  return {
    endUserId: row.id,
    personId: row.person_id,
    lineUserId: row.line_user_id,
    assignedCastId: row.assigned_cast_id,
    primaryLineAccountId: row.primary_line_account_id,
    status: row.status,
    planCode: row.plan_code,
    nickname: row.nickname,
    lineProfileSyncedAt: row.line_profile_synced_at,
    createdAt: row.created_at,
  };
}

/** LINE UID に紐づく関係行をすべて返す（0件もありうる） */
export async function getRelationshipsByLineUserId(
  supabase: SupabaseAdmin,
  lineUserId: string
): Promise<PersonRelationship[]> {
  const { data, error } = await supabase
    .from("end_users")
    .select(RELATIONSHIP_COLUMNS)
    .eq("line_user_id", lineUserId);

  if (error) {
    // 取得失敗を空配列に潰すと「初回フォロー」と誤判定して行を二重に作る。
    // 呼び出し側で扱えるよう投げる。
    throw new Error(`getRelationshipsByLineUserId failed: ${error.message}`);
  }
  return (data ?? []).map((r) => toRelationship(r as RawRelationshipRow));
}

/** person に属する関係行をすべて返す */
export async function getRelationshipsByPerson(
  supabase: SupabaseAdmin,
  personId: string
): Promise<PersonRelationship[]> {
  const { data, error } = await supabase
    .from("end_users")
    .select(RELATIONSHIP_COLUMNS)
    .eq("person_id", personId);

  if (error) {
    throw new Error(`getRelationshipsByPerson failed: ${error.message}`);
  }
  return (data ?? []).map((r) => toRelationship(r as RawRelationshipRow));
}

/** end_user_id から person を引く */
export async function getPersonIdForEndUser(
  supabase: SupabaseAdmin,
  endUserId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("end_users")
    .select("person_id")
    .eq("id", endUserId)
    .maybeSingle();
  return data?.person_id ?? null;
}

/**
 * 受信イベントの着地先となる関係行を取得（無ければ作る）。
 *
 * LINEフォロー・メッセージ受信の入口で使う。従来の ensureIncompleteEndUser は
 * UIDだけで1行に決め打ちしていたため、複数メイトでは着地先が不定になる。
 */
export async function ensureInboundRelationship(
  supabase: SupabaseAdmin,
  params: {
    lineUserId: string;
    /** 受信した公式アカウントの担当メイト（共通アカウントは null） */
    accountCastId: string | null;
    /** 受信した公式アカウントのID（会話アカウント判定・共通アカウントのフォールバックに使う） */
    accountId?: string | null;
    planCode: string;
  }
): Promise<{
  id: string;
  isNew: boolean;
  personId: string;
  nickname: string;
  lineProfileSyncedAt: string | null;
}> {
  const rows = await getRelationshipsByLineUserId(supabase, params.lineUserId);
  const picked = pickRelationshipRow(
    rows.map<RelationshipRow>((r) => ({
      id: r.endUserId,
      assignedCastId: r.assignedCastId,
      primaryLineAccountId: r.primaryLineAccountId,
    })),
    params.accountCastId,
    params.accountId ?? null
  );

  if (picked) {
    const found = rows.find((r) => r.endUserId === picked.id)!;
    return {
      id: found.endUserId,
      isNew: false,
      personId: found.personId,
      nickname: found.nickname,
      lineProfileSyncedAt: found.lineProfileSyncedAt,
    };
  }

  // 既存行があるなら同じ人の新しい見込み行として作る（別人にしない）
  const personId = rows[0]?.personId ?? null;

  const { data: created, error } = await supabase
    .from("end_users")
    .insert({
      line_user_id: params.lineUserId,
      nickname: endUserNicknameFromLineId(params.lineUserId),
      status: "incomplete",
      plan_code: params.planCode,
      ...(personId ? { person_id: personId } : {}),
    })
    .select("id, person_id, nickname, line_profile_synced_at")
    .single();

  if (!error && created) {
    return {
      id: created.id,
      isNew: true,
      personId: created.person_id,
      nickname: created.nickname,
      lineProfileSyncedAt: created.line_profile_synced_at,
    };
  }

  // 同時受信で見込み行が二重に作られた場合（uq_end_users_line_uid_per_mate 違反）は
  // 勝った側の行を読み直して使う。
  if (error?.code === "23505") {
    const retry = await getRelationshipsByLineUserId(supabase, params.lineUserId);
    const again = pickRelationshipRow(
      retry.map<RelationshipRow>((r) => ({
        id: r.endUserId,
        assignedCastId: r.assignedCastId,
        primaryLineAccountId: r.primaryLineAccountId,
      })),
      params.accountCastId,
      params.accountId ?? null
    );
    if (again) {
      const found = retry.find((r) => r.endUserId === again.id)!;
      return {
        id: found.endUserId,
        isNew: false,
        personId: found.personId,
        nickname: found.nickname,
        lineProfileSyncedAt: found.lineProfileSyncedAt,
      };
    }
  }

  throw new Error(`ensureInboundRelationship failed: ${error?.message ?? "unknown"}`);
}

/**
 * 指定メイトとの関係行を取得（無ければ作る）。契約成立（Stripe Webhook）で使う。
 *
 * 未契約の見込み行があればそれを昇格させる（会話履歴・流入元・友だち追加日時を引き継ぐため。
 * 新しい行を作ると「申し込む前のやり取り」が別スレッドに取り残される）。
 */
export async function ensureRelationshipForCast(
  supabase: SupabaseAdmin,
  params: {
    lineUserId: string;
    castId: string;
    planCode: string;
    /** 既知の person（追加契約では呼び出し側が把握している） */
    personId?: string | null;
  }
): Promise<{ id: string; personId: string; isNew: boolean }> {
  const rows = await getRelationshipsByLineUserId(supabase, params.lineUserId);

  const existing = rows.find((r) => r.assignedCastId === params.castId);
  if (existing) {
    return { id: existing.endUserId, personId: existing.personId, isNew: false };
  }

  const lead = rows.find((r) => r.assignedCastId === null);
  if (lead) {
    // 見込み行をこのメイトとの関係行へ昇格。
    // .is("assigned_cast_id", null) 条件付きなので、並行する別メイトの決済が先に
    // 昇格させていると0件更新になる。0件更新はエラーにならず黙って成功するため、
    // .select() で実際に更新できた行数を確認する（確認しないと別メイトの行を
    // 自分の関係行として返し、契約・入金の紐付け先を取り違える）。
    const { data: promoted, error } = await supabase
      .from("end_users")
      .update({ assigned_cast_id: params.castId })
      .eq("id", lead.endUserId)
      .is("assigned_cast_id", null)
      .select("id");
    if (!error && (promoted?.length ?? 0) === 1) {
      return { id: lead.endUserId, personId: lead.personId, isNew: false };
    }
    logger.warn("ensureRelationshipForCast: lead promotion did not apply, creating new row", {
      endUserId: lead.endUserId,
      error: error?.message ?? "0 rows updated (raced with another promotion)",
    });
  }

  const personId = params.personId ?? rows[0]?.personId ?? null;
  const { data: created, error } = await supabase
    .from("end_users")
    .insert({
      line_user_id: params.lineUserId,
      nickname: endUserNicknameFromLineId(params.lineUserId),
      status: "incomplete",
      plan_code: params.planCode,
      assigned_cast_id: params.castId,
      ...(personId ? { person_id: personId } : {}),
    })
    .select("id, person_id")
    .single();

  if (!error && created) {
    return { id: created.id, personId: created.person_id, isNew: true };
  }

  // 同時実行で先に作られた場合は読み直す（uq_end_users_person_cast / uid索引）
  if (error?.code === "23505") {
    const retry = await getRelationshipsByLineUserId(supabase, params.lineUserId);
    const again = retry.find((r) => r.assignedCastId === params.castId);
    if (again) {
      return { id: again.endUserId, personId: again.personId, isNew: false };
    }
  }

  throw new Error(`ensureRelationshipForCast failed: ${error?.message ?? "unknown"}`);
}

/**
 * その人が現在ライブ契約しているメイトID。
 *
 * 「契約済みメイトを選択肢から外す」「上限判定」に使う。
 * ライフサイクル状態で必ず絞る（解約済みは含めない＝再契約できる）。
 */
export async function getLiveContractedCastIds(
  supabase: SupabaseAdmin,
  personId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("end_users!inner(person_id, assigned_cast_id)")
    .eq("end_users.person_id", personId)
    .in("status", [...LIVE_SUBSCRIPTION_STATUSES]);

  if (error) {
    throw new Error(`getLiveContractedCastIds failed: ${error.message}`);
  }

  const castIds = new Set<string>();
  for (const row of data ?? []) {
    const rel = (row as unknown as { end_users: { assigned_cast_id: string | null } }).end_users;
    if (rel?.assigned_cast_id) castIds.add(rel.assigned_cast_id);
  }
  return [...castIds];
}

/**
 * その人が過去に無料トライアルを使ったか。
 *
 * トライアル権は **person 単位**。関係行（end_users）単位で判定すると
 * 「メイトを変えるたびに無料トライアルが付く」穴になる。
 */
export async function hasPersonUsedTrial(
  supabase: SupabaseAdmin,
  personId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("end_users")
    .select("id")
    .eq("person_id", personId)
    .not("trial_started_at", "is", null)
    .limit(1);

  if (error) {
    // 判定できないときは「使用済み」に倒す（無料の取りこぼしより、無限に無料を配る方が損失が大きい）
    logger.error("hasPersonUsedTrial failed, treating as used", { error: error.message });
    return true;
  }
  return (data?.length ?? 0) > 0;
}
