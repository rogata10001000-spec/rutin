/**
 * 「1ユーザー = 1メイト」前提での、受信メッセージの受け入れ判定。
 *
 * LINEの公式アカウントはメイトごとに分かれているため、契約者が担当外メイトの
 * アカウントへ送ってくることがある（拡散・別メイトの友だち追加・担当変更の直後など）。
 * その扱いを1箇所のルールに集約する（webhookハンドラの奥に条件を散らさない）。
 *
 * "server-only" を付けないのは、この判定を単体テストで固定するため。
 */

export type InboundRoutingContext = {
  /** 受信したLINE公式アカウントのID（共通アカウントは null のこともある） */
  accountId: string | null;
  /** そのアカウントの担当メイトID（共通アカウントは null） */
  accountCastId: string | null;
  /** 共通(Rutin公式)アカウントか */
  isDefaultAccount: boolean;
  /** ユーザーの担当メイトID */
  assignedCastId: string | null;
  /** 会話が現在乗っているアカウントID（end_users.primary_line_account_id） */
  primaryLineAccountId: string | null;
};

/**
 * 担当外メイト宛のメッセージとして弾くべきか。
 *
 * 弾く条件（すべて満たすとき）:
 *   - 共通アカウント宛ではない（共通は全員の窓口なので常に受け取る）
 *   - そのアカウントに担当メイトが紐づいている
 *   - ユーザーに担当メイトが決まっている
 *   - その担当メイトのアカウントではない
 *   - かつ「会話が現在乗っているアカウント」でもない
 *
 * 最後の条件が重要。担当変更(A→B)の直後は primary が旧メイトAのアカウントのままで、
 * 新担当Bの返信も getSendAccountForEndUser 経由でAのアカウントから送られる。
 * ここを弾くと「メッセージは届くのに返信すると無視される」手詰まりになる。
 */
export function shouldRejectAsWrongMate(ctx: InboundRoutingContext): boolean {
  if (ctx.isDefaultAccount) return false;
  if (!ctx.accountCastId) return false;
  if (!ctx.assignedCastId) return false;
  if (ctx.accountCastId === ctx.assignedCastId) return false;

  // 会話が現在乗っているアカウント宛なら受け取る
  if (ctx.accountId !== null && ctx.accountId === ctx.primaryLineAccountId) return false;

  return true;
}

/**
 * 会話アカウント（primary_line_account_id）を、このアカウントへ張り替えてよいか。
 *
 * 契約者は担当メイトのアカウントにしか張り替えない。担当外メイトを友だち追加/送信しただけで
 * 張り替えると、以後の担当メイトの返信・通知がすべて担当外メイト名義で届く誤配信になる。
 * 未契約者は最後に触れたメイトアカウントに乗せる（そのメイト経由の集客を成立させるため）。
 */
export function shouldSwitchPrimaryAccount(params: {
  isDefaultAccount: boolean;
  accountId: string | null;
  accountCastId: string | null;
  currentPrimaryAccountId: string | null;
  assignedCastId: string | null;
  isContracted: boolean;
}): boolean {
  if (params.isDefaultAccount || !params.accountId) return false;
  if (params.currentPrimaryAccountId === params.accountId) return false;
  if (params.isContracted && params.assignedCastId !== params.accountCastId) return false;
  return true;
}
