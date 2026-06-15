"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Select } from "@/components/common/Select";

type AuditLogFiltersProps = {
  actions: string[];
  targetTypes: string[];
  currentAction?: string;
  currentTargetType?: string;
};

export function AuditLogFilters({
  actions,
  targetTypes,
  currentAction,
  currentTargetType,
}: AuditLogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/admin/audit?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        aria-label="アクションで絞り込み"
        size="sm"
        fullWidth={false}
        className="w-auto min-w-[10rem]"
        value={currentAction ?? ""}
        onChange={(value) => updateFilter("action", value || null)}
        options={[
          { value: "", label: "全アクション" },
          ...actions.map((action) => ({ value: action, label: action })),
        ]}
      />

      <Select
        aria-label="対象種別で絞り込み"
        size="sm"
        fullWidth={false}
        className="w-auto min-w-[10rem]"
        value={currentTargetType ?? ""}
        onChange={(value) => updateFilter("targetType", value || null)}
        options={[
          { value: "", label: "全対象" },
          ...targetTypes.map((targetType) => ({ value: targetType, label: targetType })),
        ]}
      />

      {(currentAction || currentTargetType) && (
        <button
          onClick={() => router.push("/admin/audit")}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          クリア
        </button>
      )}
    </div>
  );
}
