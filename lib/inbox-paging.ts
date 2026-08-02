/**
 * 受信トレイの表示件数。サーバー（actions/inbox.ts）とクライアント（もっと見る）で
 * 同じ値を使うため、"use server" を持たない素のモジュールに置く。
 *
 * 受信トレイは「上から順に片付ける作業キュー」なので、全件を毎回描画する必要はない。
 * 全件を返すと顧客数に比例して RSC ペイロード・DOM 行数・描画時間が際限なく増える。
 * 絞り込み・並び替え・件数サマリーは従来どおり全件に対して計算し、返すのは先頭ぶんだけにする。
 */
export const INBOX_PAGE_SIZE = 50;

/** URLパラメータ経由で巨大な limit を渡されても描画が破綻しないための上限。 */
export const MAX_INBOX_PAGE_SIZE = 500;

/** URLの limit パラメータを安全な件数に正規化する。 */
export function normalizeInboxLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return INBOX_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(parsed), INBOX_PAGE_SIZE), MAX_INBOX_PAGE_SIZE);
}
