"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const PLAN_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
] as const;

export function CancellationFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPlan = searchParams.get("plan") ?? "";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-stone-500">プラン</span>
        <div className="flex flex-wrap gap-2">
          {PLAN_OPTIONS.map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => updateFilter("plan", opt.value)}
              className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                currentPlan === opt.value
                  ? "bg-terracotta text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
