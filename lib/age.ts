/**
 * 生年月日から満年齢を計算する。
 *
 * @param birthDateString ISO 8601 (`YYYY-MM-DD`) 形式の生年月日。
 * @param now             基準日（テスト容易性のため。省略時は現在日時）。
 * @returns               満年齢。null が渡された / パース不能 / 未来の日付なら null。
 */
export function calculateAge(
  birthDateString: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!birthDateString) return null;

  const birth = new Date(birthDateString);
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getTime() > now.getTime()) return null;

  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthdayThisYear =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthdayThisYear) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}
