import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/**
 * 伴走メイト選択画面（/subscribe/cast）の骨組み。
 * `/subscribe` は常に `/subscribe/cast` へリダイレクトするため、
 * 両方の loading.tsx から同じ骨組みを使って遷移の見た目を連続させる。
 */
export function CastSelectSkeleton() {
  return (
    <div className="min-h-screen bg-background-light">
      <div className="relative mx-auto flex h-auto min-h-screen w-full max-w-[480px] flex-col overflow-x-hidden border-x border-orange-50 bg-background-light antialiased">
        <nav className="sticky top-0 z-50 flex items-center justify-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          {/*
           * 静的プレースホルダ。本画面のタイトルは funnel_copy（cast.nav.title）で編集可能なため、
           * タイトルを編集している場合はロード中の一瞬だけ表示が異なることがある（許容）。
           */}
          <h2 className="whitespace-nowrap text-lg font-bold leading-tight text-[#2D241E]">
            伴走メイトを選ぶ
          </h2>
        </nav>

        <div className="flex-1 pb-12">
          {/* トライアル案内カード */}
          <div className="px-4 py-4">
            <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/10 p-5">
              <LoadingSkeleton className="h-5 w-48" />
              <LoadingSkeleton className="h-4 w-full" />
              <LoadingSkeleton className="h-4 w-3/4" />
            </div>
          </div>

          {/* 性別フィルター */}
          <div className="flex gap-2.5 px-4 py-3">
            <LoadingSkeleton className="h-9 w-[86px] rounded-full" />
            <LoadingSkeleton className="h-9 w-[72px] rounded-full" />
            <LoadingSkeleton className="h-9 w-[72px] rounded-full" />
            <LoadingSkeleton className="h-9 w-[86px] rounded-full" />
          </div>

          {/* 伴走メイトカード（2列グリッド・3:4） */}
          <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <LoadingSkeleton key={i} className="aspect-[3/4] w-full rounded-3xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CastSelectSkeleton;
