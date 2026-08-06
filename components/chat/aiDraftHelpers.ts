// =============================================================
// AI下書きUIの純粋ロジック。
//
// UIコンポーネント（.tsx）から切り出しているのは、
// 「本文への反映のしかた」と「採用トラッキングを続けるかの判定」が
// 送信データの正しさに直結する（＝テストで守るべき）ロジックだから。
// React/DOMに依存しないので tests/unit からそのまま検証できる。
// =============================================================

/** 下書きを本文へ反映するときの方法 */
export type DraftApplyMode = "replace" | "append";

/**
 * 下書きをコンポーザー本文へ反映した結果を返す。
 * - 本文が空（空白のみを含む）なら、モードによらずそのまま挿入する
 * - append は既存本文の末尾に改行を1つ挟んで続ける（既に改行で終わっていれば増やさない）
 */
export function applyDraftToBody(
  current: string,
  draftBody: string,
  mode: DraftApplyMode
): string {
  if (current.trim() === "") return draftBody;
  if (mode === "replace") return draftBody;
  const separator = /\n[ \t]*$/.test(current) ? "" : "\n";
  return `${current}${separator}${draftBody}`;
}

/** 空白（全角スペース含む）を除いた比較用の文字列にする */
function normalizeForCompare(text: string): string {
  return text.replace(/[\s　]+/g, "");
}

/** 文字バイグラムの配列。日本語は語の区切りが無いため文字単位で見る */
function bigrams(text: string): string[] {
  const chars = [...normalizeForCompare(text)];
  if (chars.length <= 1) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    out.push(chars[i] + chars[i + 1]);
  }
  return out;
}

/**
 * 文字バイグラムの Dice 係数（0〜1）。
 * 1 = 実質同じ、0 = 共通部分なし。日本語の部分編集を素直に評価できる。
 */
export function similarityRatio(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) {
    return normalizeForCompare(a) === normalizeForCompare(b) ? 1 : 0;
  }

  const counts = new Map<string, number>();
  for (const gram of left) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let hits = 0;
  for (const gram of right) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      counts.set(gram, remaining - 1);
      hits += 1;
    }
  }

  return (2 * hits) / (left.length + right.length);
}

/**
 * 「この送信はAI下書きの採用とみなすか」のしきい値。
 * 下書きの素材が4割以上残っていれば“手直しして採用した”と扱う。
 */
export const DRAFT_ADOPTION_THRESHOLD = 0.4;

/**
 * 送信時に aiDraftId を付けるかどうかの判定。
 *
 * 目的は採用率・編集率の計測なので「手直しした採用」は採用として数えたい。
 * 一方で、メイトが入力欄を全消しして一から書き直した文まで採用に数えると
 * 指標が水増しされる。そこで次の順で判定する:
 *   1. 送信本文が空 → 採用ではない（そもそも送れない）
 *   2. 下書きが本文にそのまま含まれる → 採用（末尾追加や前後に書き足した場合）
 *   3. 文字バイグラムの類似度が DRAFT_ADOPTION_THRESHOLD 以上 → 採用（部分的な手直し）
 *   4. それ以外 → 別物として書き直された ＝ 採用しない
 */
export function shouldKeepDraftId(draftBody: string, finalBody: string): boolean {
  const draft = normalizeForCompare(draftBody);
  const final = normalizeForCompare(finalBody);
  if (final.length === 0 || draft.length === 0) return false;
  if (final.includes(draft)) return true;
  return similarityRatio(draftBody, finalBody) >= DRAFT_ADOPTION_THRESHOLD;
}

/**
 * 数字キー（1/2/3）を下書きのインデックスへ変換する。該当しなければ null。
 * パネル表示中のショートカット用。
 */
export function draftIndexFromKey(key: string, draftCount: number): number | null {
  if (key.length !== 1) return null;
  const index = "123".indexOf(key);
  if (index < 0 || index >= draftCount) return null;
  return index;
}
