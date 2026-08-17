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
};

/**
 * 受信したLINE公式アカウントの担当メイトから、着地させる関係行を選ぶ。
 *
 * 優先順位:
 *   1. そのメイトと契約している行（＝契約者の会話。最優先）
 *   2. 未契約の見込み行（＝そのメイトをまだ契約していない人の会話）
 *   3. なし（呼び出し側が新規作成する）
 *
 * 共通(Rutin公式)アカウント宛（castId = null）は、契約中の行があってもそこへは寄せず
 * 見込み行を使う。共通アカウントは特定メイトとの会話ではないため、
 * 契約中メイトのトーク履歴に混ぜてはいけない。
 */
export function pickRelationshipRow(
  rows: readonly RelationshipRow[],
  accountCastId: string | null
): RelationshipRow | null {
  if (accountCastId) {
    const contracted = rows.find((r) => r.assignedCastId === accountCastId);
    if (contracted) return contracted;
  }
  return rows.find((r) => r.assignedCastId === null) ?? null;
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
