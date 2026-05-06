import { InboxRowSkeleton } from "@/components/common/LoadingSkeleton";

export default function InboxLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-stone-200" />
          <div className="mt-1 h-4 w-64 animate-pulse rounded bg-stone-100" />
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-1 shadow-soft">
        <div className="p-4 border-b border-stone-100">
          <div className="h-10 w-full animate-pulse rounded-xl bg-stone-100" />
        </div>
        <div className="p-4">
          <InboxRowSkeleton count={10} />
        </div>
      </div>
    </div>
  );
}
