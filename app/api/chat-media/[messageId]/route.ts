import { NextResponse } from "next/server";
import { getCurrentStaff, canAccessUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { extractChatMediaPath } from "@/lib/chat-media";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 署名付きURLの有効期間。配信直後だけ有効な短命にし、URL漏えい時の露出を最小化する。
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * チャット画像の認証付き配信。
 * - スタッフ認証必須。担当キャストは担当ユーザーの画像のみ（admin/supervisorは全件）。
 * - 認可後、非公開バケットの短命署名付きURLへリダイレクトする（実体はCDNから配信）。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const staff = await getCurrentStaff();
  if (!staff) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { messageId } = await params;
  const admin = createAdminSupabaseClient();

  const { data: message, error } = await admin
    .from("messages")
    .select("end_user_id, media_url, message_type")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message || message.message_type !== "image" || !message.media_url) {
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
  // 短命の署名付きURLをブラウザにキャッシュさせない（期限切れ後の壊れ表示を防ぐ）。
  response.headers.set("Cache-Control", "no-store");
  return response;
}
