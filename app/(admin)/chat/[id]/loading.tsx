import { ChatSkeleton } from "@/components/common/LoadingSkeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-stone-200 p-4">
        <div className="h-6 w-32 animate-pulse rounded bg-stone-200" />
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded-xl bg-stone-100" />
          <div className="h-8 w-20 animate-pulse rounded-xl bg-stone-100" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <ChatSkeleton count={8} />
      </div>
      <div className="border-t border-stone-200 p-4">
        <div className="h-20 w-full animate-pulse rounded-xl bg-stone-100" />
      </div>
    </div>
  );
}
