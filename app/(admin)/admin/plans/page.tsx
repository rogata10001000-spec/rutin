import { getPlansAdmin } from "@/actions/admin/plans";
import { PlansTable } from "@/components/admin/plans/PlansTable";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const result = await getPlansAdmin();

  if (!result.ok) {
    return <ErrorState title="プランを読み込めませんでした" message={result.error.message} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">プラン管理</h1>
        <p className="mt-1 text-sm text-stone-500">
          プランごとの返信目安（SLA）を設定します。受信トレイの優先度と警告に反映されます。
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
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
            <h3 className="text-sm font-medium text-blue-800">この画面でできること</h3>
            <p className="mt-1 text-sm text-blue-700">
              各プランの返信目安（SLA）と警告タイミングを編集できます。プランの価格は「価格設定」、
              申込画面の表示名・説明文は「申込画面プレビュー」から変更してください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
