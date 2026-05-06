import { TableSkeleton } from "@/components/common/LoadingSkeleton";

export default function UsersLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded bg-stone-200" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded bg-stone-100" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-xl bg-stone-200" />
      </div>
      <div className="mb-4">
        <div className="h-10 w-full animate-pulse rounded-xl bg-stone-100" />
      </div>
      <div className="rounded-lg border bg-white p-4">
        <TableSkeleton rows={10} />
      </div>
    </div>
  );
}
