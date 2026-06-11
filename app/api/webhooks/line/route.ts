import { handleLineWebhook } from "@/lib/line-webhook-handler";
import { getDefaultLineAccount } from "@/lib/line-accounts";

/**
 * レガシー互換: デフォルト(共通)Routine公式アカウント宛の Webhook。
 * 既存の LINE Developers 設定（Webhook URL = /api/webhooks/line）を変更不要にする。
 * メイト個別アカウントは /api/webhooks/line/[accountId] を使う。
 */
export async function POST(request: Request) {
  const account = await getDefaultLineAccount();
  return handleLineWebhook(request, account);
}
