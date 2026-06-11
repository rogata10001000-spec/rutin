import { handleLineWebhook } from "@/lib/line-webhook-handler";
import { getLineAccountById, getDefaultLineAccount } from "@/lib/line-accounts";
import { logger } from "@/lib/logger";

/**
 * メイト別LINE公式アカウント宛の Webhook。
 * LINE Developers コンソールで各チャネルの Webhook URL を
 * https://<APP_BASE_URL>/api/webhooks/line/<accountId> に設定する。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  const account = await getLineAccountById(accountId);
  if (!account) {
    // 設定不備（無効/未登録）の場合はデフォルトにフォールバックせず 404。
    // ただしデフォルトアカウントのidが渡ってきた場合は許容する。
    const fallback = await getDefaultLineAccount();
    if (fallback.id && fallback.id === accountId) {
      return handleLineWebhook(request, fallback);
    }
    logger.warn("LINE webhook: unknown or inactive account", { accountId });
    return new Response("Not Found", { status: 404 });
  }

  return handleLineWebhook(request, account);
}
