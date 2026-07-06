import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <LoadingSkeleton className="h-8 w-32" />
        <LoadingSkeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <LoadingSkeleton className="h-6 w-48" />
        <LoadingSkeleton className="mt-3 h-4 w-full max-w-md" />
        <LoadingSkeleton className="mt-6 h-16 w-full" />
      </div>
    </div>
  );
}
