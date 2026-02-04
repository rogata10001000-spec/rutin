"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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
      <select
        value={currentAction ?? ""}
        onChange={(e) => updateFilter("action", e.target.value || null)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">全アクション</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {action}
          </option>
        ))}
      </select>

      <select
        value={currentTargetType ?? ""}
        onChange={(e) => updateFilter("targetType", e.target.value || null)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">全対象</option>
        {targetTypes.map((targetType) => (
          <option key={targetType} value={targetType}>
            {targetType}
          </option>
        ))}
      </select>

      {(currentAction || currentTargetType) && (
        <button
          onClick={() => router.push("/admin/audit")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          クリア
        </button>
      )}
    </div>
  );
}
