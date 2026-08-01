import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** ポイント画面（app/(user)/points/page.tsx）の案内ボックスと同じ器 */
export default function PointsLoading() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <LoadingSkeleton className="h-7 w-64" />
      <div className="mt-3 space-y-2">
        <LoadingSkeleton className="h-4 w-48" />
        <LoadingSkeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
