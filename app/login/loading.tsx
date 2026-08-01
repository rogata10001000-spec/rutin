import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** ログイン画面（app/login/page.tsx）と同じ器・同じ行数で表示のズレを防ぐ */
export default function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 pattern-grid-lg text-stone-800">
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-2xl bg-white p-10 shadow-soft-lg ring-1 ring-stone-900/5">
          {/* 上部アクセント（本体と同じ位置） */}
          <div className="absolute left-0 top-0 h-1.5 w-full bg-terracotta" />

          <div className="mb-10 text-center">
            <h1 className="font-sans text-3xl font-bold tracking-tight text-stone-800">
              Rutin
            </h1>
            <LoadingSkeleton className="mx-auto mt-3 h-4 w-52" />
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <LoadingSkeleton className="h-4 w-28" />
              <LoadingSkeleton className="h-[46px] w-full rounded-xl" />
            </div>
            <div className="space-y-2">
              <LoadingSkeleton className="h-4 w-24" />
              <LoadingSkeleton className="h-[46px] w-full rounded-xl" />
            </div>
            <LoadingSkeleton className="h-[46px] w-full rounded-xl" />
          </div>

          <div className="mt-8 flex justify-center">
            <LoadingSkeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
    </div>
  );
}
