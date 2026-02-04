import { getGiftCatalogAdmin, getPointProductsAdmin } from "@/actions/admin/gifts";
import { GiftCatalogTable } from "@/components/admin/gifts/GiftCatalogTable";
import { PointProductsTable } from "@/components/admin/gifts/PointProductsTable";

export const dynamic = "force-dynamic";

export default async function GiftsPage() {
  const [giftsResult, pointsResult] = await Promise.all([
    getGiftCatalogAdmin(),
    getPointProductsAdmin(),
  ]);

  if (!giftsResult.ok || !pointsResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {giftsResult.ok ? "" : giftsResult.error.message}
        {pointsResult.ok ? "" : pointsResult.error.message}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ギフト・ポイント管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          ギフトカタログとポイント商品を管理します
        </p>
      </div>

      <div className="space-y-8">
        {/* ギフトカタログ */}
        <div className="rounded-lg border bg-white">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              ギフトカタログ
            </h2>
          </div>
          <GiftCatalogTable items={giftsResult.data.items} />
        </div>

        {/* ポイント商品 */}
        <div className="rounded-lg border bg-white">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              ポイント商品
            </h2>
          </div>
          <PointProductsTable items={pointsResult.data.items} />
        </div>
      </div>
    </div>
  );
}
