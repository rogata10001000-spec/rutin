"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const PRESETS = [
  { value: "current_month", label: "今月" },
  { value: "previous_month", label: "先月" },
  { value: "last_3_months", label: "過去3ヶ月" },
  { value: "custom", label: "カスタム" },
] as const;

export function RevenuePeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPreset = searchParams.get("preset") ?? "current_month";
  const periodFrom = searchParams.get("from") ?? "";
  const periodTo = searchParams.get("to") ?? "";

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePresetChange = (preset: string) => {
    if (preset === "custom") {
      updateParams({ preset, from: periodFrom || null, to: periodTo || null });
    } else {
      updateParams({ preset, from: null, to: null });
    }
  };

  const handleCustomSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const from = String(formData.get("from") ?? "");
    const to = String(formData.get("to") ?? "");
    if (from && to) {
      updateParams({ preset: "custom", from, to });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => handlePresetChange(preset.value)}
            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              currentPreset === preset.value
                ? "bg-terracotta text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {currentPreset === "custom" && (
        <form onSubmit={handleCustomSubmit} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="revenue-from" className="mb-1 block text-xs font-medium text-stone-500">
              開始日
            </label>
            <input
              id="revenue-from"
              name="from"
              type="date"
              defaultValue={periodFrom}
              className="rounded-md border border-stone-200 px-3 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="revenue-to" className="mb-1 block text-xs font-medium text-stone-500">
              終了日
            </label>
            <input
              id="revenue-to"
              name="to"
              type="date"
              defaultValue={periodTo}
              className="rounded-md border border-stone-200 px-3 py-1.5 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center whitespace-nowrap rounded-full bg-terracotta px-4 py-2 text-sm font-bold text-white hover:bg-[#d0694e]"
          >
            適用
          </button>
        </form>
      )}
    </div>
  );
}
