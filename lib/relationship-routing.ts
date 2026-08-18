/**
 * 「人 × メイト」の関係行をどう選ぶかの純粋ロジック。
 *
 * 複数メイト契約に対応したことで、同じ LINE UID に対して end_users の行が
 * 複数存在しうる（契約メイトごとに1行 ＋ 未契約の見込み行が最大1行）。
 * どの行に着地させるかを1箇所のルールに集約する。
 *
 * "server-only" を付けないのは、この判定を単体テストで固定するため
 * （lib/mate-routing.ts と同じ方針）。
 */

export type RelationshipRow = {
  id: string;
  /** 担当メイト。null = まだどのメイトとも契約していない見込み行 */
  assignedCastId: string | null;
  /** 会話が現在乗っているLINE公式アカウント（end_users.primary_line_account_id） */
  primaryLineAccountId?: string | null;
};

/**
 * 受信したLINE公式アカウントから、着地させる関係行を選ぶ。
 *
 * 優先順位:
 *   1. そのアカウントの担当メイトと契約している行（＝契約者の会話。最優先）
 *   2. 会話が現在そのアカウントに乗っている行（primary_line_account_id 一致）。
 *      担当変更(A→B)の直後は、行の担当はBでも会話は旧メイトAのアカウントに
 *      乗ったままになる（getSendAccountForEndUser がAから返信する）。
 *      この規則が無いと、その期間のユーザー返信が見込み行へ落ちて
 *      「返信したのに新規向けの勧誘が返ってくる」手詰まりになる
 *      （旧 shouldRejectAsWrongMate の isConversationAccount 例外と同じ意図）。
 *   3. 未契約の見込み行
 *   4. 共通(Rutin公式)アカウント宛のみ: 契約中の行へフォールバック。
 *      1メイト運用では従来「共通アカウント宛も本人の唯一の行」に載っていたため、
 *      ここを落とすと契約者が共通アカウントへ送った瞬間に見込み行が作られ、
 *      支払い済みの人に新規向けの契約案内が返る退行になる。
 *      複数契約なら行IDで決定的に1行へ寄せる（毎回同じスレッドに載せる）。
 *   5. なし（呼び出し側が新規作成する）
 */
export function pickRelationshipRow(
  rows: readonly RelationshipRow[],
  accountCastId: string | null,
  accountId?: string | null
): RelationshipRow | null {
  if (accountCastId) {
    const contracted = rows.find((r) => r.assignedCastId === accountCastId);
    if (contracted) return contracted;
  }

  if (accountId) {
    const conversation = rows.find((r) => r.primaryLineAccountId === accountId);
    if (conversation) return conversation;
  }

  const lead = rows.find((r) => r.assignedCastId === null);
  if (lead) return lead;

  if (!accountCastId && rows.length > 0) {
    return [...rows].sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  return null;
}

/**
 * 追加契約の対象にできるメイトか。
 *
 * 除外するのは「既にライブ契約中のメイト」だけ。解約済みのメイトは再契約できる
 * （[状態ガードは状態に対して敷く] の通り、過去の関係ではなく現在の状態で判定する）。
 */
export type ContractEligibility = "ok" | "already_contracted" | "limit_reached";

export function canContractWithCast(params: {
  castId: string;
  /** 現在ライブ契約中のメイトID */
  liveCastIds: readonly string[];
  /** 同時契約できるメイト数の上限 */
  maxConcurrent: number;
}): ContractEligibility {
  // 「契約済み」を上限より先に判定する。上限に達した状態で契約中メイトを選んだとき
  // 「上限に達しました」と出すと、利用者は原因を取り違える。
  if (params.liveCastIds.includes(params.castId)) return "already_contracted";
  if (params.liveCastIds.length >= params.maxConcurrent) return "limit_reached";
  return "ok";
}

/** 同時に契約できるメイト数の上限。青天井にすると決済事故・運用事故の被害が読めなくなる。 */
export const MAX_CONCURRENT_MATES = 3;
