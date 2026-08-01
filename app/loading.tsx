import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/**
 * ルート直下のフォールバック。
 * 各セグメントの loading.tsx が優先されるため、ここが出るのは
 * 「まだどの画面か決まっていない」瞬間（ルートのロール振り分け・レイアウト解決中）だけ。
 * 画面固有の形に寄せず、中央に控えめなプレースホルダーだけを出す。
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-3">
        <LoadingSkeleton className="h-7 w-32" />
        <LoadingSkeleton className="h-4 w-full" />
        <LoadingSkeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
