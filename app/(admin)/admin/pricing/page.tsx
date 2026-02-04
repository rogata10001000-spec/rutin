import { getPriceOverrides, getCastsForPricing } from "@/actions/admin/pricing";
import { getPlanPrices } from "@/actions/admin/plan-prices";
import { PricingTabs } from "@/components/admin/pricing/PricingTabs";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [overridesResult, castsResult, planPricesResult] = await Promise.all([
    getPriceOverrides(),
    getCastsForPricing(),
    getPlanPrices(),
  ]);

  if (!overridesResult.ok || !castsResult.ok || !planPricesResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {overridesResult.ok ? "" : overridesResult.error.message}
        {castsResult.ok ? "" : castsResult.error.message}
        {planPricesResult.ok ? "" : planPricesResult.error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">価格設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          プランの価格を管理できます
        </p>
      </div>

      <PricingTabs
        overrides={overridesResult.data.items}
        casts={castsResult.data.items}
        planPrices={planPricesResult.data.items}
      />
    </div>
  );
}
