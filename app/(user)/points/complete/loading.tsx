import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/** ポイント購入完了画面と同じ縦位置・同じ器 */
export default function PointsCompleteLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <LoadingSkeleton className="mb-4 size-[60px] rounded-full" />
      <LoadingSkeleton className="mb-2 h-8 w-64" />
      <LoadingSkeleton className="mb-6 h-5 w-72" />
      <LoadingSkeleton className="h-4 w-56" />
    </div>
  );
}
