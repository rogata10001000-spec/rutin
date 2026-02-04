import { getAuditLogs, getAuditActions, getAuditTargetTypes } from "@/actions/audit";
import { AuditLogTable } from "@/components/admin/audit/AuditLogTable";
import { AuditLogFilters } from "@/components/admin/audit/AuditLogFilters";

export const dynamic = "force-dynamic";

type SearchParams = {
  action?: string;
  targetType?: string;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const [logsResult, actionsResult, targetTypesResult] = await Promise.all([
    getAuditLogs({
      action: params.action,
      targetType: params.targetType,
    }),
    getAuditActions(),
    getAuditTargetTypes(),
  ]);

  if (!logsResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {logsResult.error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">監査ログ</h1>
        <p className="mt-1 text-sm text-gray-500">
          システムの操作履歴を確認できます
        </p>
      </div>

      <div className="mb-4">
        <AuditLogFilters
          actions={actionsResult.ok ? actionsResult.data.actions : []}
          targetTypes={targetTypesResult.ok ? targetTypesResult.data.targetTypes : []}
          currentAction={params.action}
          currentTargetType={params.targetType}
        />
      </div>

      <div className="rounded-lg border bg-white">
        <AuditLogTable items={logsResult.data.items} />
      </div>
    </div>
  );
}
