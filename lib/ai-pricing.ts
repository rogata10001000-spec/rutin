/**
 * Claude API のモデル別単価（USD / 100万トークン）。
 *
 * 以前は「Haiku 4.5 の単価」を定数で1組だけ持ち、コメントで
 * 「モデルを変更したらここも更新すること」と書いていた。
 * だが AI_MODEL は環境変数で自由に変えられるため、上位モデルへ切り替えると
 * 費用表示だけが旧単価のまま（Sonnet なら実際の 1/3 程度）静かに過少表示になる。
 *
 * ai_draft_requests.model に実際に使ったモデル名が記録されているので、
 * 集計はモデルごとに単価を引いて合算する。表に無いモデルは 0円で黙って
 * 混ぜず「単価未登録」として画面に出す（過少表示に気づけるようにする）。
 */

export type AiModelPrice = {
  /** USD / 100万入力トークン */
  inputPerMTok: number;
  /** USD / 100万出力トークン */
  outputPerMTok: number;
};

/**
 * 単価表。新しいモデルを使い始めたらここに1行足す。
 * キーは ai_draft_requests.model に入る値（= AI_MODEL の値）と完全一致させる。
 */
export const AI_MODEL_PRICES: Record<string, AiModelPrice> = {
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-3-5-haiku-20241022": { inputPerMTok: 0.8, outputPerMTok: 4 },
  "claude-sonnet-4-5-20250929": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-1-20250805": { inputPerMTok: 15, outputPerMTok: 75 },
};

/** モデル名の前方一致でも引けるようにする（日付サフィックス違いを拾う） */
export function findAiModelPrice(model: string | null): AiModelPrice | null {
  if (!model) return null;
  const exact = AI_MODEL_PRICES[model];
  if (exact) return exact;
  // "claude-haiku-4-5" のようにバージョン日付を省いた値が入っていても引けるようにする
  const prefixKey = Object.keys(AI_MODEL_PRICES).find((key) => key.startsWith(model));
  return prefixKey ? AI_MODEL_PRICES[prefixKey] : null;
}

/**
 * 円換算レート。社内で予算感を掴むための概算値で、
 * 実際の請求額（為替・課金タイミング）とは一致しない。画面上も必ず「概算」と明記する。
 */
export const USD_JPY = 155;

export type TokenUsage = { inputTokens: number; outputTokens: number };

/** モデル別のトークン使用量からUSDコストを求める。単価未登録のモデルは分けて返す。 */
export function sumAiCostUsd(usageByModel: Map<string, TokenUsage>): {
  usd: number;
  /** 単価が未登録で金額に含められなかったモデル名 */
  unpricedModels: string[];
  /** 単価未登録ぶんのトークン数（画面で「この分は金額に含まれない」と出す） */
  unpricedTokens: number;
} {
  let usd = 0;
  const unpricedModels: string[] = [];
  let unpricedTokens = 0;

  for (const [model, usage] of usageByModel) {
    const price = findAiModelPrice(model);
    if (!price) {
      // 集計から黙って落とすと「安く見える」ので、必ず呼び出し元へ返して画面に出す
      if (model) unpricedModels.push(model);
      unpricedTokens += usage.inputTokens + usage.outputTokens;
      continue;
    }
    usd +=
      (usage.inputTokens / 1_000_000) * price.inputPerMTok +
      (usage.outputTokens / 1_000_000) * price.outputPerMTok;
  }

  return { usd, unpricedModels, unpricedTokens };
}
