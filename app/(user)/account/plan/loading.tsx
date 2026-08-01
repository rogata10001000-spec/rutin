import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** 契約・プラン画面（PlanManager）と同じ器・同じセクション構成 */
export default function AccountPlanLoading() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <LoadingSkeleton className="h-7 w-36" />
        <LoadingSkeleton className="h-4 w-64" />
      </header>

      {/* 現在の契約サマリー */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="h-5 w-16 rounded-full" />
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <LoadingSkeleton className="h-8 w-32" />
            <LoadingSkeleton className="mt-1 h-4 w-40" />
          </div>
          <LoadingSkeleton className="h-6 w-24 shrink-0" />
        </div>

        <div className="mt-4 space-y-1.5 border-t border-stone-100 pt-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <LoadingSkeleton className="h-4 w-24" />
              <LoadingSkeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </section>

      {/* プラン変更 */}
      <section className="space-y-3">
        <LoadingSkeleton className="h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex flex-col gap-1">
                  <LoadingSkeleton className="h-6 w-28" />
                  <LoadingSkeleton className="h-3 w-48" />
                  <LoadingSkeleton className="h-3 w-32" />
                </div>
                <LoadingSkeleton className="h-6 w-20 shrink-0" />
              </div>
              <LoadingSkeleton className="mt-3 h-10 w-full rounded-full" />
            </div>
          ))}
        </div>
        <LoadingSkeleton className="h-3 w-64" />
      </section>
    </div>
  );
}
