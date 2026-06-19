import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <LoadingSkeleton className="h-4 w-40" />
        <LoadingSkeleton className="h-7 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft"
          >
            <LoadingSkeleton className="h-4 w-24" />
            <LoadingSkeleton className="mt-4 h-8 w-20" />
            <LoadingSkeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
