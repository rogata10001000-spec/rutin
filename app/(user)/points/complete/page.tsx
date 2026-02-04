"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function PointsPurchaseCompletePage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-green-100 p-4">
        <svg
          className="h-12 w-12 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        購入が完了しました
      </h1>
      <p className="mb-6 text-gray-600">
        ポイントがアカウントに追加されました
      </p>
      <p className="text-sm text-gray-400">
        このページを閉じてLINEに戻ってください
      </p>
    </div>
  );
}
