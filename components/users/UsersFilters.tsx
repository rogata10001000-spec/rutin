"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function UsersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cancelPending = searchParams.get("cancelPending") === "1";

  const toggleCancelPending = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (cancelPending) {
      params.delete("cancelPending");
    } else {
      params.set("cancelPending", "1");
    }
    router.push(`/users?${params.toString()}`);
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={toggleCancelPending}
        className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
          cancelPending
            ? "bg-amber-500 text-white"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        解約予定のみ
      </button>
    </div>
  );
}
