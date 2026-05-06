import { TableSkeleton } from "@/components/common/LoadingSkeleton";

export default function StaffLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-stone-200" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded bg-stone-100" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-xl bg-stone-200" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
