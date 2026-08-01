import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** プラン選択画面（app/subscribe/plan/page.tsx）と同じ器・同じカード構成 */
export default function SubscribePlanLoading() {
  return (
    <div className="min-h-screen bg-background-light">
      <main className="mx-auto flex max-w-[480px] flex-col border-x border-orange-50 bg-background-light pb-12 shadow-sm">
        <nav className="sticky top-0 z-50 flex items-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <div className="size-10 shrink-0" />
          <h2 className="flex-1 whitespace-nowrap pr-10 text-center text-lg font-bold leading-tight text-[#2D241E]">
            プランを選ぶ
          </h2>
        </nav>

        {/* 担当メイトの案内カード */}
        <div className="px-4 py-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-5">
            <LoadingSkeleton className="h-5 w-40" />
            <LoadingSkeleton className="h-4 w-full" />
            <LoadingSkeleton className="h-4 w-5/6" />
          </div>
        </div>

        {/* プランカード（ライト / スタンダード / プレミアム） */}
        <div className="flex flex-col gap-4 px-4">
          {["light", "standard", "premium"].map((planCode) => (
            <div
              key={planCode}
              className={`ios-shadow flex flex-col gap-4 rounded-2xl border bg-white p-5 ${
                planCode === "standard"
                  ? "border-primary ring-1 ring-primary/20"
                  : "border-warm-border/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <LoadingSkeleton className="h-7 w-24" />
                  <LoadingSkeleton className="h-3 w-44" />
                  <LoadingSkeleton className="h-3 w-28" />
                </div>
                <LoadingSkeleton className="h-7 w-20 shrink-0" />
              </div>

              <div className="space-y-1.5">
                <LoadingSkeleton className="h-3 w-full" />
                <LoadingSkeleton className="h-3 w-2/3" />
              </div>

              <LoadingSkeleton className="h-11 w-full rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
