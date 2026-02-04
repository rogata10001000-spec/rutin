import { getPlansAdmin } from "@/actions/admin/plans";
import { PlansTable } from "@/components/admin/plans/PlansTable";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const result = await getPlansAdmin();

  if (!result.ok) {
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">プラン管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          プランのSLA設定を管理します（参考実装）
        </p>
      </div>

      <div className="rounded-lg border bg-white">
        <PlansTable items={result.data.items} />
      </div>

      {/* Info */}
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex">
          <svg
            className="h-5 w-5 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">参考実装について</h3>
            <p className="mt-1 text-sm text-blue-700">
              この画面ではSLA時間の編集のみ可能です。新規プランの追加や価格設定は将来の拡張として実装予定です。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
