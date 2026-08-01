import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/**
 * 契約完了画面（app/subscribe/complete/page.tsx）の骨組み。
 * Stripe のセッション照会を待つ間に出るため、決済直後の不安を減らすよう
 * 「確認しています」だけは実文言で見せる。
 */
export default function SubscribeCompleteLoading() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="mb-6 rounded-full bg-primary/10 p-4">
        <span
          className="material-symbols-outlined animate-spin text-primary"
          style={{ fontSize: "40px" }}
          aria-hidden
        >
          progress_activity
        </span>
      </div>
      <h1 className="whitespace-nowrap text-2xl font-bold text-stone-900">
        ご契約を確認しています
      </h1>
      <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-2">
        <LoadingSkeleton className="h-4 w-full" />
        <LoadingSkeleton className="h-4 w-3/4" />
        <LoadingSkeleton className="mt-2 h-4 w-2/3" />
      </div>
      <LoadingSkeleton className="mt-6 h-9 w-32 rounded-md" />
    </main>
  );
}
