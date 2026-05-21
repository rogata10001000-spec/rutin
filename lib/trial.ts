import { getServerEnv } from "@/lib/env";

export function getTrialPeriodDays(): number {
  return getServerEnv().TRIAL_PERIOD_DAYS;
}

export function formatTrialDaysLabel(days: number): string {
  return `${days}日間`;
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

/** キャスト選択画面のトライアル案内（短文） */
export function getCastPageTrialIntro(days: number): {
  title: string;
  body: string;
} {
  return {
    title: `${formatTrialDaysLabel(days)}無料でお試し`,
    body: `気になる伴走メイトを選んで、まずは${formatTrialDaysLabel(days)}無料でメッセージのやりとりを体験できます。いつでも解約可能です。`,
  };
}

/** プラン選択画面のトライアル + 自動課金明示 */
export function getPlanPageTrialNotice(
  days: number,
  monthlyPriceYen: number
): string {
  const price = formatYen(monthlyPriceYen);
  return `選んだプランで${formatTrialDaysLabel(days)}の無料トライアルを開始します。トライアル期間中はいつでも解約でき、料金は発生しません。トライアル終了後は月額${price}が自動請求されます（解約しない限り毎月更新）。`;
}

export function getPlanCheckoutButtonLabel(days: number): string {
  return `このプランで${formatTrialDaysLabel(days)}無料トライアル`;
}

/** LINE welcome メッセージ */
export function getLineWelcomeTrialMessage(days: number, subscribeUrl: string): string {
  return `Rutinへようこそ！

以下のリンクからメイトを選んで、${formatTrialDaysLabel(days)}の無料トライアルを始めましょう。
${subscribeUrl}`;
}

/** 決済完了画面 */
export function getCompleteTrialMessage(
  days: number,
  monthlyPriceYen: number | null
): { title: string; body: string } {
  const pricePart =
    monthlyPriceYen != null
      ? `トライアル終了後は月額${formatYen(monthlyPriceYen)}が自動請求されます。`
      : "トライアル終了後は選択プランの月額料金が自動請求されます。";
  return {
    title: `${formatTrialDaysLabel(days)}の無料トライアルを開始しました`,
    body: `${formatTrialDaysLabel(days)}は無料でご利用いただけます。${pricePart}トライアル期間中はいつでも解約できます。`,
  };
}
