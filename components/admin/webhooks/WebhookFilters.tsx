"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/common/Select";

export function WebhookFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentProvider = searchParams.get("provider") ?? "";
  const currentSuccess = searchParams.get("success") ?? "";

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
    <div className="flex flex-wrap gap-3">
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">
          プロバイダ
        </label>
        <Select
          aria-label="プロバイダで絞り込み"
          size="sm"
          className="w-auto min-w-[8rem]"
          value={currentProvider}
          onChange={(value) => updateFilter("provider", value)}
          options={[
            { value: "", label: "すべて" },
            { value: "line", label: "LINE" },
            { value: "stripe", label: "Stripe" },
          ]}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">
          状態
        </label>
        <Select
          aria-label="状態で絞り込み"
          size="sm"
          className="w-auto min-w-[8rem]"
          value={currentSuccess}
          onChange={(value) => updateFilter("success", value)}
          options={[
            { value: "", label: "すべて" },
            { value: "true", label: "成功のみ" },
            { value: "false", label: "失敗のみ" },
          ]}
        />
      </div>
    </div>
  );
}
