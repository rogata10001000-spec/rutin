import { NextResponse } from "next/server";
import { getCurrentStaff, canAccessUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { extractChatMediaPath } from "@/lib/chat-media";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 署名付きURLの有効期間。短命にしてURL漏えい時の露出を最小化する。
const SIGNED_URL_TTL_SECONDS = 300;

// リダイレクト自体をブラウザ（そのユーザーだけ）にキャッシュさせる秒数。
// 署名の有効期間より短くして、期限切れURLを再利用しないようにする。
// これが無い（no-store）と、スクロールで画面外に出て戻るたび、スレッドを開き直すたびに
// 画像1枚ごとに「認証＋DB2回＋署名＋302」をやり直すことになる。
const REDIRECT_CACHE_SECONDS = SIGNED_URL_TTL_SECONDS - 60;

/**
 * チャット画像の認証付き配信。
 * - スタッフ認証必須。担当キャストは担当ユーザーの画像のみ（admin/supervisorは全件）。
 * - 認可後、非公開バケットの短命署名付きURLへリダイレクトする（実体はCDNから配信）。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const admin = createAdminSupabaseClient();

  // 認証とメッセージ取得は独立なので並列で行う（画像1枚あたりの往復を1回分減らす）。
  const [staff, messageResult] = await Promise.all([
    getCurrentStaff(),
    admin
      .from("messages")
      .select("end_user_id, media_url, message_type")
      .eq("id", messageId)
      .maybeSingle(),
  ]);

  if (!staff) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const message = messageResult.data;
  if (
    messageResult.error ||
    !message ||
    message.message_type !== "image" ||
    !message.media_url
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const access = await canAccessUser(message.end_user_id);
  if (!access) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const path = extractChatMediaPath(message.media_url);
  const { data: signed, error: signError } = await admin.storage
    .from("chat-media")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    logger.warn("chat-media sign failed", { messageId, error: signError?.message });
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.redirect(signed.signedUrl);
  // private = 本人のブラウザにだけ保存（CDN・共有キャッシュには残さない）。
  // 署名の期限より短い間だけ再利用させ、期限切れURLでの壊れ表示を防ぐ。
  response.headers.set("Cache-Control", `private, max-age=${REDIRECT_CACHE_SECONDS}`);
  return response;
}
