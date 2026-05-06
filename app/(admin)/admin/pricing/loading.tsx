import { TableSkeleton } from "@/components/common/LoadingSkeleton";

export default function PricingLoading() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-8 w-32 animate-pulse rounded bg-stone-200" />
        <div className="mt-1 h-4 w-64 animate-pulse rounded bg-stone-100" />
      </div>
      <div className="mb-4 flex gap-2">
        <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-200" />
        <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-100" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
