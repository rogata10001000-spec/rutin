import { InboxRowSkeleton } from "@/components/common/LoadingSkeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* 左ペイン: フィルタ + 一覧 */}
      <aside className="flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft lg:w-[26rem] lg:shrink-0">
        <div className="shrink-0 border-b border-stone-100 p-4">
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-stone-200" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-stone-100" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <InboxRowSkeleton count={10} />
        </div>
      </aside>

      {/* 中央ペイン: チャットプレースホルダ（lg以上） */}
      <section className="hidden min-w-0 flex-1 lg:flex">
        <div className="flex-1 animate-pulse rounded-2xl border border-stone-200 bg-white shadow-soft" />
      </section>
    </div>
  );
}
