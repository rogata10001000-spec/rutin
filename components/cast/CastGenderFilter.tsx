"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type CastGenderFilterValue = "all" | "female" | "male" | "other";

const OPTIONS: { value: CastGenderFilterValue; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "other", label: "その他" },
];

type CastGenderFilterProps = {
  current: CastGenderFilterValue;
};

export function CastGenderFilter({ current }: CastGenderFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (value: CastGenderFilterValue) => {
    if (value === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("gender");
    } else {
      params.set("gender", value);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/subscribe/cast?${query}` : "/subscribe/cast");
    });
  };

  return (
    <div
      className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 py-3"
      role="tablist"
      aria-label="伴走メイトの性別で絞り込み"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(opt.value)}
            disabled={isPending}
            className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-bold transition-colors ${
              active
                ? "bg-primary text-white shadow-sm"
                : "border border-warm-border bg-white text-[#2D241E] hover:border-primary/40 dark:bg-zinc-900 dark:text-zinc-300"
            } ${isPending ? "opacity-60" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default CastGenderFilter;
