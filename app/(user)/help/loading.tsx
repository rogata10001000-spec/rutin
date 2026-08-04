import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** 使い方ページ（app/(user)/help/page.tsx）と同じ5セクション構成・角丸に合わせる */
export default function HelpLoading() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <section key={i} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <LoadingSkeleton className="mb-4 h-6 w-40" />
          <div className="space-y-2">
            <LoadingSkeleton className="h-4 w-full" />
            <LoadingSkeleton className="h-4 w-full" />
            <LoadingSkeleton className="h-4 w-2/3" />
          </div>
        </section>
      ))}
    </div>
  );
}
