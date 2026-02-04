import Link from "next/link";
import { getStaffList } from "@/actions/admin/staff";
import { getCastPhotos } from "@/actions/cast-photos";

export const dynamic = "force-dynamic";

type CastWithPhotos = {
  id: string;
  displayName: string;
  photoCount: number;
  firstPhotoUrl: string | null;
  active: boolean;
  acceptingNewUsers: boolean;
};

export default async function CastPhotosPage() {
  const staffResult = await getStaffList();

  if (!staffResult.ok) {
    return (
      <div className="p-4 text-center text-red-600">
        {staffResult.error.message}
      </div>
    );
  }

  // キャストのみフィルタ
  const casts = staffResult.data.items.filter((s) => s.role === "cast");

  // 各キャストの写真情報を取得
  const castsWithPhotos: CastWithPhotos[] = await Promise.all(
    casts.map(async (cast) => {
      const photosResult = await getCastPhotos(cast.id);
      const photos = photosResult.ok ? photosResult.data.photos : [];

      return {
        id: cast.id,
        displayName: cast.displayName,
        photoCount: photos.length,
        firstPhotoUrl: photos[0]?.url ?? null,
        active: cast.active,
        acceptingNewUsers: cast.acceptingNewUsers,
      };
    })
  );

  // 写真が少ないキャストを先に表示
  const sortedCasts = [...castsWithPhotos].sort((a, b) => {
    if (a.photoCount === b.photoCount) {
      return a.displayName.localeCompare(b.displayName, "ja");
    }
    return a.photoCount - b.photoCount;
  });

  const castsNeedingPhotos = castsWithPhotos.filter((c) => c.photoCount < 3);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">キャスト写真管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            全キャストの写真登録状況を確認・管理できます
          </p>
        </div>
      </div>

      {/* アラートカード */}
      {castsNeedingPhotos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 text-xl">⚠️</span>
            <div>
              <h3 className="font-bold text-amber-800">
                写真が不足しているキャスト
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                {castsNeedingPhotos.length}人のキャストが3枚未満の写真しか登録していません。
                プロフィールを充実させるために、最低3枚の写真登録を推奨します。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {castsNeedingPhotos.slice(0, 5).map((cast) => (
                  <Link
                    key={cast.id}
                    href={`/admin/staff/${cast.id}/photos`}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors"
                  >
                    {cast.displayName}
                    <span className="text-amber-600">({cast.photoCount}/5)</span>
                  </Link>
                ))}
                {castsNeedingPhotos.length > 5 && (
                  <span className="text-sm text-amber-600">
                    他 {castsNeedingPhotos.length - 5}人
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 統計サマリー */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">総キャスト数</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {castsWithPhotos.length}人
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">写真完備</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {castsWithPhotos.filter((c) => c.photoCount >= 3).length}人
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">写真不足</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {castsNeedingPhotos.length}人
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">写真未登録</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {castsWithPhotos.filter((c) => c.photoCount === 0).length}人
          </p>
        </div>
      </div>

      {/* キャスト一覧 */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">キャスト一覧</h2>
        </div>

        {sortedCasts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            キャストが登録されていません
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedCasts.map((cast) => (
              <Link
                key={cast.id}
                href={`/admin/staff/${cast.id}/photos`}
                className="flex items-start gap-4 rounded-xl border border-gray-200 p-4 hover:border-primary hover:shadow-md transition-all"
              >
                {/* サムネイル */}
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {cast.firstPhotoUrl ? (
                    <img
                      src={cast.firstPhotoUrl}
                      alt={cast.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <svg
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-gray-900">
                      {cast.displayName}
                    </h3>
                    {!cast.active && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        無効
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    {/* 写真枚数バッジ */}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        cast.photoCount === 0
                          ? "bg-red-100 text-red-700"
                          : cast.photoCount < 3
                          ? "bg-amber-100 text-amber-700"
                          : cast.photoCount === 5
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {cast.photoCount}/5枚
                    </span>

                    {/* 状態バッジ */}
                    {cast.acceptingNewUsers ? (
                      <span className="inline-flex items-center rounded-full bg-sage/20 px-2 py-0.5 text-xs font-medium text-sage-800">
                        受付中
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        受付停止
                      </span>
                    )}
                  </div>

                  {/* 写真不足の警告 */}
                  {cast.photoCount < 3 && (
                    <p className="mt-2 text-xs text-amber-600">
                      写真を追加してください
                    </p>
                  )}
                </div>

                {/* 矢印 */}
                <div className="flex-shrink-0 text-gray-400">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
