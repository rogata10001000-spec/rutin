import { getPayoutRules } from "@/actions/admin/payout-rules";
import { getCastsForPricing } from "@/actions/admin/pricing";
import { PayoutRulesTable } from "@/components/admin/payout-rules/PayoutRulesTable";
import { PayoutRuleForm } from "@/components/admin/payout-rules/PayoutRuleForm";

export const dynamic = "force-dynamic";

export default async function PayoutRulesPage() {
  const [rulesResult, castsResult] = await Promise.all([
    getPayoutRules(),
    getCastsForPricing(),
  ]);

  if (!rulesResult.ok || !castsResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {rulesResult.ok ? "" : rulesResult.error.message}
        {castsResult.ok ? "" : castsResult.error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">配分ルール</h1>
        <p className="mt-1 text-sm text-gray-500">
          ギフト売上のキャスト配分率を設定します
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ルール追加フォーム */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              新規ルール追加
            </h2>
            <PayoutRuleForm casts={castsResult.data.items} />
          </div>
        </div>

        {/* ルール一覧 */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-white">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                設定済みルール
              </h2>
            </div>
            <PayoutRulesTable items={rulesResult.data.items} />
          </div>
        </div>
      </div>
    </div>
  );
}
