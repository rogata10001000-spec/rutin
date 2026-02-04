import { Suspense } from "react";
import { getWebhookEvents, getWebhookStats } from "@/actions/admin/webhooks";
import { WebhookEventsTable } from "@/components/admin/webhooks/WebhookEventsTable";
import { WebhookFilters } from "@/components/admin/webhooks/WebhookFilters";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";

export const dynamic = "force-dynamic";

type SearchParams = {
  provider?: string;
  success?: string;
};

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const [eventsResult, statsResult] = await Promise.all([
    getWebhookEvents({
      provider: params.provider as "line" | "stripe" | undefined,
      success: params.success === "true" ? true : params.success === "false" ? false : undefined,
    }),
    getWebhookStats(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Webhook監視</h1>
        <p className="mt-1 text-sm text-gray-500">
          LINE/StripeからのWebhookイベントを監視できます
        </p>
      </div>

      {/* Stats Cards */}
      {statsResult.ok && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-medium text-gray-500">今日の処理</h3>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {statsResult.data.totalToday}
            </p>
            <div className="mt-1 flex gap-2 text-sm">
              <span className="text-green-600">
                成功: {statsResult.data.successToday}
              </span>
              {statsResult.data.failedToday > 0 && (
                <span className="text-red-600">
                  失敗: {statsResult.data.failedToday}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-medium text-gray-500">過去7日間</h3>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {statsResult.data.totalWeek}
            </p>
            <div className="mt-1 flex gap-2 text-sm">
              <span className="text-green-600">
                成功: {statsResult.data.successWeek}
              </span>
              {statsResult.data.failedWeek > 0 && (
                <span className="text-red-600">
                  失敗: {statsResult.data.failedWeek}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-medium text-gray-500">成功率（今週）</h3>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {statsResult.data.totalWeek > 0
                ? Math.round((statsResult.data.successWeek / statsResult.data.totalWeek) * 100)
                : 100}
              %
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <Suspense fallback={null}>
          <WebhookFilters />
        </Suspense>
      </div>

      {/* Events Table */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            イベント一覧
          </h2>
          {eventsResult.ok && (
            <p className="mt-1 text-sm text-gray-500">
              {eventsResult.data.total}件中 最新{eventsResult.data.items.length}件を表示
            </p>
          )}
        </div>
        <Suspense fallback={<div className="p-4"><TableSkeleton rows={10} /></div>}>
          {eventsResult.ok ? (
            <WebhookEventsTable items={eventsResult.data.items} />
          ) : (
            <div className="p-4 text-center text-red-600">
              {eventsResult.error.message}
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
