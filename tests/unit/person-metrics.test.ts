import { describe, expect, it } from "vitest";
import { computePersonMetrics } from "@/lib/person-metrics";

describe("computePersonMetrics", () => {
  it("複数メイト契約者を1人として数え、ARPUは契約数でなく実人数で割る", () => {
    // Aさん=2契約 / Bさん=1契約 → 契約3件・実人数2人・MRR16,940円
    const r = computePersonMetrics({
      activePersonIds: ["A", "A", "B"],
      estimatedMrrJpy: 16940,
      churnRate: 0.1,
    });
    expect(r.personCount).toBe(2);
    expect(r.multiMatePersonCount).toBe(1);
    expect(r.multiMateRatio).toBe(0.5);
    expect(r.avgMatesPerPerson).toBe(1.5);
    // 契約数で割ると 5,647 円だが、1人あたりの実態は 8,470 円
    expect(r.arpuPerPersonJpy).toBe(8470);
    expect(r.ltvPerPersonJpy).toBe(84700);
  });

  it("1人1契約のとき、契約数ベースの指標と一致する（既存運用で数字が変わらない）", () => {
    const r = computePersonMetrics({
      activePersonIds: ["A", "B", "C"],
      estimatedMrrJpy: 20940,
      churnRate: 0.1,
    });
    expect(r.personCount).toBe(3);
    expect(r.multiMatePersonCount).toBe(0);
    expect(r.multiMateRatio).toBe(0);
    expect(r.avgMatesPerPerson).toBe(1);
    expect(r.arpuPerPersonJpy).toBe(6980);
  });

  it("0件でもゼロ除算せず null を返す", () => {
    const r = computePersonMetrics({ activePersonIds: [], estimatedMrrJpy: 0, churnRate: 0.1 });
    expect(r.personCount).toBe(0);
    expect(r.multiMateRatio).toBeNull();
    expect(r.avgMatesPerPerson).toBeNull();
    expect(r.arpuPerPersonJpy).toBeNull();
    expect(r.ltvPerPersonJpy).toBeNull();
  });

  it("解約率が null / 0 のときLTVを出さない（無限大を表示しない）", () => {
    expect(
      computePersonMetrics({ activePersonIds: ["A"], estimatedMrrJpy: 6980, churnRate: null })
        .ltvPerPersonJpy
    ).toBeNull();
    expect(
      computePersonMetrics({ activePersonIds: ["A"], estimatedMrrJpy: 6980, churnRate: 0 })
        .ltvPerPersonJpy
    ).toBeNull();
  });

  it("person_id 欠損行は人数に数えないが契約数には数える", () => {
    const r = computePersonMetrics({
      activePersonIds: ["A", null],
      estimatedMrrJpy: 6980,
      churnRate: 0.1,
    });
    expect(r.personCount).toBe(1);
    expect(r.avgMatesPerPerson).toBe(2);
  });
});
