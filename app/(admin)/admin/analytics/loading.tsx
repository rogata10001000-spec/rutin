import { CardSkeleton } from "@/components/common/LoadingSkeleton";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-40 animate-pulse rounded bg-stone-200" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-stone-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
            <div className="h-4 w-24 animate-pulse rounded bg-stone-100" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
