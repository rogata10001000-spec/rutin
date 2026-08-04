import type { StaffGender } from "@/lib/supabase/types";

/**
 * メイト表示まわりの共通表示ヘルパー（純データ・純関数）。
 * クライアント/サーバー両方から import できるよう、env・DB・"server-only" を持ち込まない。
 */

/** 性別の表示ラベル（一覧・詳細モーダル・絞り込みで共通） */
export const GENDER_LABEL: Record<StaffGender, string> = {
  female: "女性",
  male: "男性",
  other: "その他",
};

/** 金額の円表示（画面共通） */
export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}
