/**
 * 「人（person）単位」の指標。
 *
 * 複数メイト契約に対応した結果、end_users の1行は「人 × メイト」の関係になり、
 * **行数（契約数）は人数ではなくなった**。
 * 契約数を母数にした ARPU / LTV だけを見ていると、追加契約が増えるほど
 * 「1人あたりいくら払っているか」が実態より小さく見える（指標の意味が黙って変わる）。
 *
 * 純関数にして単体テストで固定する（lib/relationship-routing.ts と同じ方針）。
 */

export type PersonMetricsInput = {
  /** ライブ契約とみなす行だけを渡す（解約済み・未契約は呼び出し側で除外する） */
  activePersonIds: readonly (string | null)[];
  /** 推定MRR（税込） */
  estimatedMrrJpy: number;
  /** 月次解約率（0〜1）。null / 0 のときLTVは出さない */
  churnRate: number | null;
};

export type PersonMetrics = {
  /** ライブ契約を持つ実人数 */
  personCount: number;
  /** 2人以上のメイトと契約している人数 */
  multiMatePersonCount: number;
  /** 複数メイト率。この施策のKPI */
  multiMateRatio: number | null;
  /** 1人あたりの平均契約メイト数 */
  avgMatesPerPerson: number | null;
  /** 1人あたりARPU */
  arpuPerPersonJpy: number | null;
  /** 1人あたりLTV近似 */
  ltvPerPersonJpy: number | null;
};

export function computePersonMetrics(input: PersonMetricsInput): PersonMetrics {
  const matesByPerson = new Map<string, number>();
  let contractCount = 0;

  for (const personId of input.activePersonIds) {
    contractCount += 1;
    // person_id が無い行（移行途中の想定外データ）は人数に数えない。
    // 契約数には数えるので、平均契約メイト数が実態より小さくなることはない。
    if (!personId) continue;
    matesByPerson.set(personId, (matesByPerson.get(personId) ?? 0) + 1);
  }

  const personCount = matesByPerson.size;
  const multiMatePersonCount = [...matesByPerson.values()].filter((n) => n >= 2).length;
  const arpuPerPersonJpy =
    personCount > 0 ? Math.round(input.estimatedMrrJpy / personCount) : null;

  return {
    personCount,
    multiMatePersonCount,
    multiMateRatio: personCount > 0 ? multiMatePersonCount / personCount : null,
    avgMatesPerPerson: personCount > 0 ? contractCount / personCount : null,
    arpuPerPersonJpy,
    ltvPerPersonJpy:
      arpuPerPersonJpy && input.churnRate && input.churnRate > 0
        ? Math.round(arpuPerPersonJpy / input.churnRate)
        : null,
  };
}
