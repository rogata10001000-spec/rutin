import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** メールログイン画面（EmailLoginForm）と同じ器・同じ行数 */
export default function AccountLoginLoading() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="whitespace-nowrap text-xl font-bold text-stone-900">ログイン</h1>
        <div className="mt-1 space-y-1.5">
          <LoadingSkeleton className="h-4 w-full" />
          <LoadingSkeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <LoadingSkeleton className="h-5 w-32" />
        <LoadingSkeleton className="mt-1 h-3 w-full" />
        <LoadingSkeleton className="mt-3 h-11 w-full rounded-xl" />
        <LoadingSkeleton className="mt-4 h-11 w-full rounded-full" />
      </div>

      <LoadingSkeleton className="mx-1 h-3 w-64" />
    </div>
  );
}
