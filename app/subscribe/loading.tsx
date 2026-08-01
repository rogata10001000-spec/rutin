import { CastSelectSkeleton } from "./CastSelectSkeleton";

/** /subscribe は /subscribe/cast へ振り分けるだけなので、着地先と同じ骨組みを見せる */
export default function SubscribeLoading() {
  return <CastSelectSkeleton />;
}
