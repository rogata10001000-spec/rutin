import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** プロフィール管理（app/(cast)/my-photos/page.tsx）と同じヘッダー＋2カード構成 */
export default function MyPhotosLoading() {
  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-6">
        <LoadingSkeleton className="h-8 w-48" />
        <LoadingSkeleton className="mt-1 h-4 w-80" />
      </div>

      {/* プロフィール文エディター */}
      <div className="mb-6 rounded-lg border bg-white p-6">
        <LoadingSkeleton className="h-5 w-40" />
        <LoadingSkeleton className="mt-3 h-28 w-full rounded-xl" />
        <LoadingSkeleton className="mt-3 h-10 w-32 rounded-xl" />
      </div>

      {/* 写真エディター */}
      <div className="rounded-lg border bg-white p-6">
        <LoadingSkeleton className="h-5 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
