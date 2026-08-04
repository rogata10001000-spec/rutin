import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <LoadingSkeleton className="h-8 w-56" />
        <LoadingSkeleton className="mt-2 h-4 w-80" />
      </div>
      <LoadingSkeleton className="h-10 w-32" />
      <div className="mt-4 space-y-3">
        <LoadingSkeleton className="h-24 w-full rounded-2xl" />
        <LoadingSkeleton className="h-24 w-full rounded-2xl" />
        <LoadingSkeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
