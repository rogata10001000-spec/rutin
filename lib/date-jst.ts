/**
 * JST（Asia/Tokyo）基準の日付ユーティリティ
 */

export function getJstToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function getJstMonthRange(year: number, month: number): { periodFrom: string; periodTo: string } {
  const periodFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodFrom, periodTo };
}

export function getCurrentJstMonthRange(): { periodFrom: string; periodTo: string } {
  const today = getJstToday();
  const [year, month] = today.split("-").map(Number);
  return getJstMonthRange(year, month);
}

export function getPreviousJstMonthRange(): { periodFrom: string; periodTo: string } {
  const today = getJstToday();
  const [year, month] = today.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getJstMonthRange(prevYear, prevMonth);
}

export function getLastNMonthsJstRange(months: number): { periodFrom: string; periodTo: string } {
  const { periodTo } = getCurrentJstMonthRange();
  const today = getJstToday();
  const [year, month] = today.split("-").map(Number);
  let startYear = year;
  let startMonth = month - (months - 1);
  while (startMonth <= 0) {
    startMonth += 12;
    startYear -= 1;
  }
  const { periodFrom } = getJstMonthRange(startYear, startMonth);
  return { periodFrom, periodTo };
}

export function isDateInJstMonth(dateIso: string, year: number, month: number): boolean {
  const { periodFrom, periodTo } = getJstMonthRange(year, month);
  const dateOnly = dateIso.slice(0, 10);
  return dateOnly >= periodFrom && dateOnly <= periodTo;
}

export function getJstMonthFromDate(dateIso: string): { year: number; month: number } {
  const dateOnly = dateIso.slice(0, 10);
  const [year, month] = dateOnly.split("-").map(Number);
  return { year, month };
}

export function getJstMonthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** 精算期間の開始日(YYYY-MM-DD)から「YYYY年M月分」ラベルを作る */
export function formatSettlementPeriodLabel(periodFrom: string): string {
  const [year, month] = periodFrom.slice(0, 7).split("-");
  return `${year}年${Number(month)}月分`;
}

export function addJstMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}
