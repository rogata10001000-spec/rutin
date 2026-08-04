import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

export default function FunnelPreviewLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <LoadingSkeleton className="h-7 w-48" />
        <LoadingSkeleton className="h-4 w-72" />
      </div>

      {/* 画面タブ + 公開ボタン */}
      <div className="flex items-center justify-between gap-3">
        <LoadingSkeleton className="h-10 w-full max-w-md rounded-xl" />
        <LoadingSkeleton className="h-11 w-28 rounded-xl" />
      </div>

      {/* 2ペイン */}
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="order-2 space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-soft lg:order-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <LoadingSkeleton className="h-4 w-40" />
              <LoadingSkeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="order-1 rounded-2xl border border-stone-200 bg-white p-5 shadow-soft lg:order-2">
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-9 w-56 rounded-lg" />
            <LoadingSkeleton className="ml-auto h-9 w-40 rounded-lg" />
          </div>
          <LoadingSkeleton className="mx-auto mt-4 h-[60vh] min-h-[400px] w-full max-w-[375px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
