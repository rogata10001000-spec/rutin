"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

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
        <label className="block text-xs font-medium text-gray-500 mb-1">
          プロバイダ
        </label>
        <select
          value={currentProvider}
          onChange={(e) => updateFilter("provider", e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">すべて</option>
          <option value="line">LINE</option>
          <option value="stripe">Stripe</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          状態
        </label>
        <select
          value={currentSuccess}
          onChange={(e) => updateFilter("success", e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">すべて</option>
          <option value="true">成功のみ</option>
          <option value="false">失敗のみ</option>
        </select>
      </div>
    </div>
  );
}
