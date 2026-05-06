import { UserDetailSkeleton } from "@/components/common/LoadingSkeleton";

export default function UserDetailLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-stone-200" />
          <div className="mt-2 flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-stone-200" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-stone-100" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-200" />
          <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-100" />
        </div>
      </div>
      <UserDetailSkeleton />
    </div>
  );
}
