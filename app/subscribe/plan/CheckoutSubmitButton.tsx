"use client";

import { useFormStatus } from "react-dom";

type CheckoutSubmitButtonProps = {
  /** 契約手続きに進めるか（LINE連携済み＋Stripe価格あり） */
  canCheckout: boolean;
  label: string;
};

/**
 * プラン選択の送信ボタン。
 *
 * Stripe のチェックアウト作成とDB書き込みが終わるまで数秒かかるため、
 * 押した直後に「反応」を返さないと二重タップ・離脱の原因になる。
 * useFormStatus で送信中を検知し、自身を非活性にしてスピナーと「処理中…」を出す。
 * ページをクライアント化しないよう、このボタンだけを切り出している。
 */
export function CheckoutSubmitButton({ canCheckout, label }: CheckoutSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!canCheckout || pending}
      aria-busy={pending}
      className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold shadow-lg transition-all active:scale-95 ${
        canCheckout
          ? "bg-primary text-white shadow-primary/30 hover:bg-primary-dark"
          : "cursor-not-allowed bg-zinc-100 text-zinc-400 shadow-none"
      } ${pending ? "cursor-wait opacity-90 active:scale-100" : ""}`}
    >
      {pending ? (
        <>
          <span
            className="material-symbols-outlined shrink-0 animate-spin text-[20px]"
            aria-hidden
          >
            progress_activity
          </span>
          <span className="whitespace-nowrap">処理中…</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default CheckoutSubmitButton;
