/**
 * PostgREST の `.or()` に渡すフィルタ式を安全に組み立てるヘルパー。
 *
 * `.or("a.ilike.%x%,b.ilike.%x%")` は「文字列としてのフィルタ構文」なので、
 * ユーザー入力をそのまま埋めると **カンマや括弧で条件を追加・改変できてしまう**
 * （フィルタ構文インジェクション）。RLS があるため他人のデータまでは抜けないが、
 * 許可範囲内での意図しない絞り込み・クエリエラー・負荷の原因になる。
 *
 * 対策は2層:
 *   1. 値を二重引用符で囲む（カンマ・括弧を構文として解釈させない）
 *   2. 二重引用符の中で意味を持つ `\` と `"` をエスケープする
 * さらに ILIKE のワイルドカード `%` `_` は前方でエスケープし、
 * 「入力した文字そのもの」で検索されるようにする。
 */

/** ILIKE のワイルドカードを打ち消す（`\` がエスケープ文字なので先に処理する）。 */
function escapeLikeWildcards(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`);
}

/** PostgREST の二重引用符付き文字列として安全な形にする。 */
function quoteForPostgrest(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 複数カラムへの部分一致 OR フィルタ式を組み立てる。
 * 例: buildIlikeOrFilter(["nickname", "email"], "a,b") →
 *     `nickname.ilike."%a,b%",email.ilike."%a,b%"`
 *
 * 空文字を渡した場合は null を返す（呼び出し側でフィルタ自体を省略する）。
 */
export function buildIlikeOrFilter(columns: string[], rawTerm: string): string | null {
  const term = rawTerm.trim();
  if (!term) return null;

  const quoted = quoteForPostgrest(`%${escapeLikeWildcards(term)}%`);
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
