/**
 * メールアドレスの正規化・簡易バリデーション。
 * DB保存・突合は常に正規化済みの値で行う（大小無視・前後空白除去）。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 前後空白除去 + 小文字化。空や無効ならnull。 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/** 形式が妥当なメールか（正規化はしない判定用）。 */
export function isValidEmail(raw: string | null | undefined): boolean {
  return normalizeEmail(raw) !== null;
}
