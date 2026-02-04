import { getTaxRates } from "@/actions/admin/tax-rates";
import { TaxRatesTable } from "@/components/admin/tax-rates/TaxRatesTable";

export const dynamic = "force-dynamic";

export default async function TaxRatesPage() {
  const result = await getTaxRates();

  if (!result.ok) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center text-red-600 border border-red-100">
        {result.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">税率管理</h1>
        <p className="mt-1 text-sm text-stone-500">
          消費税率を管理できます。税制変更時に新しい税率を追加してください。
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <TaxRatesTable items={result.data.items} />
      </div>
    </div>
  );
}
