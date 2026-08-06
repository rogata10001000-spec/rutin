/**
 * AI利用状況の表示フォーマット。
 * 日時は必ず timeZone を明示する（サーバー実行時のUTCと端末TZでズレないようにする）。
 */

const jstDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const jstDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 2026/08/06 形式（JST） */
export function jstDate(iso: string): string {
  return jstDateFormatter.format(new Date(iso));
}

/** 8/6 14:30 形式（JST） */
export function jstDateTime(iso: string): string {
  return jstDateTimeFormatter.format(new Date(iso));
}

/** 割合。母数0で算出できないときは「—」 */
export function formatRate(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** 件数（3桁区切り） */
export function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 概算の円表示（1円未満は切り上げず四捨五入） */
export function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}
