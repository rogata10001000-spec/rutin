import { getSettlementBatches } from "@/actions/admin/settlements";
import { SettlementsTable } from "@/components/admin/settlements/SettlementsTable";
import { CreateBatchForm } from "@/components/admin/settlements/CreateBatchForm";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const result = await getSettlementBatches();

  if (!result.ok) {
    return <ErrorState title="精算データを読み込めませんでした" message={result.error.message} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">精算</h1>
        <p className="mt-1 text-sm text-stone-500">
          メイトへの配分を月ごとに精算します
        </p>
      </div>

      {/* 自動化の説明バナー */}
      <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-sage/30 bg-sage/10 px-5 py-4">
        <span className="material-symbols-outlined text-sage-700" aria-hidden>
          autorenew
        </span>
        <div className="text-sm text-stone-700">
          <p className="font-bold text-sage-800">毎月1日に前月分を自動で集計します（月末締め）。</p>
          <p className="mt-0.5 text-stone-600">
            金額は自動で算出されます。下の一覧で内容を確認し、
            <span className="font-semibold">承認 → 支払い完了</span> と進めてください。
          </p>
        </div>
      </div>

      {/* 精算一覧（メイン） */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-900">月次精算の一覧</h2>
        </div>
        <SettlementsTable items={result.data.items} />
      </div>

      {/* 手動作成（補助・通常は不要） */}
      <details className="mt-6 rounded-2xl border border-stone-200 bg-white shadow-soft">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-stone-600 transition-colors hover:text-stone-900">
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-stone-400" aria-hidden>
              build
            </span>
            手動で精算を作成する（通常は不要）
          </span>
        </summary>
        <div className="border-t border-stone-100 px-6 py-5">
          <p className="mb-4 text-xs text-stone-500">
            自動作成を待たずに、特定期間の未精算分を今すぐ集計したい場合に使います。
          </p>
          <div className="max-w-md">
            <CreateBatchForm />
          </div>
        </div>
      </details>
    </div>
  );
}
