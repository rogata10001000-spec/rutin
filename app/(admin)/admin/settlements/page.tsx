import { getSettlementBatches } from "@/actions/admin/settlements";
import { SettlementsTable } from "@/components/admin/settlements/SettlementsTable";
import { CreateBatchForm } from "@/components/admin/settlements/CreateBatchForm";

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const result = await getSettlementBatches();

  if (!result.ok) {
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">精算</h1>
        <p className="mt-1 text-sm text-gray-500">
          キャストへの配分を精算します
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* バッチ作成フォーム */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              新規精算バッチ
            </h2>
            <CreateBatchForm />
          </div>
        </div>

        {/* バッチ一覧 */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-white">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                精算バッチ一覧
              </h2>
            </div>
            <SettlementsTable items={result.data.items} />
          </div>
        </div>
      </div>
    </div>
  );
}
