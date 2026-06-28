"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  /** 履歴が無い（直リンク等）ときの戻り先 */
  fallbackHref: string;
  label?: string;
};

/**
 * 「戻る」ボタン。複数の入口から開かれる詳細画面で、固定の一覧ではなく
 * 遷移元へ戻すために履歴 back を使う。履歴が無い場合のみ fallbackHref へ。
 */
export function BackButton({ fallbackHref, label = "戻る" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
