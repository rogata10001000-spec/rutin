"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PERIODS = [
  { days: 7, label: "過去7日" },
  { days: 30, label: "過去30日" },
] as const;

/**
 * 期間の切り替え（セグメントコントロール）。
 * 実行ボタンと見分けが付かなくならないよう、選択肢は選択肢の見た目にする。
 */
export function AiStatsPeriodTabs({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const change = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(days));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      role="radiogroup"
      aria-label="集計期間"
      className="inline-flex rounded-lg bg-stone-100 p-1"
    >
      {PERIODS.map((p) => {
        const selected = current === p.days;
        return (
          <button
            key={p.days}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => change(p.days)}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              selected
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
