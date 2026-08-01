import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** ギフト画面（app/(user)/gift/page.tsx）の案内ボックスと同じ器 */
export default function GiftLoading() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <LoadingSkeleton className="h-7 w-56" />
      <div className="mt-3 space-y-2">
        <LoadingSkeleton className="h-4 w-44" />
        <LoadingSkeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
