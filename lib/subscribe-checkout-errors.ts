/** Checkout 失敗時の searchParams 用エラーコード */
export const CHECKOUT_ERROR_CODES = {
  unauthorized: "LINEの案内リンクからアクセスしてください",
  expired: "LINE連携の有効期限が切れています。LINEから届いた案内リンクを再度開いてください",
  capacity: "このメイトの受付枠が満員です",
  duplicate: "既に契約中のプランがあります",
  price: "価格設定が見つかりません",
  not_found: "メイトが見つかりません",
  stopped: "このメイトは現在新規受付を停止しています",
  stripe: "決済ページの作成に失敗しました。時間をおいて再度お試しください",
  generic: "手続きを完了できませんでした。時間をおいて再度お試しください",
} as const;

export type CheckoutErrorCode = keyof typeof CHECKOUT_ERROR_CODES;

export function checkoutErrorCodeFromResult(error: {
  code: string;
  message: string;
}): CheckoutErrorCode {
  if (error.code === "UNAUTHORIZED") {
    return error.message.includes("期限") ? "expired" : "unauthorized";
  }
  if (error.code === "CONFLICT") {
    if (error.message.includes("満員")) return "capacity";
    if (error.message.includes("契約中")) return "duplicate";
    if (error.message.includes("価格")) return "price";
    if (error.message.includes("受付を停止")) return "stopped";
    return "generic";
  }
  if (error.code === "NOT_FOUND") return "not_found";
  if (error.code === "EXTERNAL_API_ERROR") return "stripe";
  return "generic";
}

export function getCheckoutErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code in CHECKOUT_ERROR_CODES) {
    return CHECKOUT_ERROR_CODES[code as CheckoutErrorCode];
  }
  return CHECKOUT_ERROR_CODES.generic;
}
