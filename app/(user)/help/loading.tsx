import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** 使い方ページ（app/(user)/help/page.tsx）と同じ4セクション構成 */
export default function HelpLoading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <section key={i} className="rounded-lg border bg-white p-6">
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
