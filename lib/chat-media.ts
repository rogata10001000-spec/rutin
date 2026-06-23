/**
 * チャット画像（chat-media バケット）の配信ヘルパー。
 *
 * バケットは非公開。画像は /api/chat-media/{messageId} 経由で配信し、
 * ルート側でスタッフ認証＋担当チェックを通したうえで短命の署名付きURLへ
 * リダイレクトする。クライアントは messageId からURLを組み立てるだけでよい
 * （初回ロードも Realtime も同じURLになる）。
 */

/** 認証付き画像配信エンドポイントのURL。 */
export function chatMediaProxyUrl(messageId: string): string {
  return `/api/chat-media/${messageId}`;
}

/**
 * messages.media_url からストレージ内パスを取り出す。
 * 旧データ（公開URL `.../chat-media/<path>`）と新データ（`<path>` のみ）の両方に対応する。
 */
export function extractChatMediaPath(mediaUrl: string): string {
  const marker = "/chat-media/";
  const idx = mediaUrl.indexOf(marker);
  return idx >= 0 ? mediaUrl.slice(idx + marker.length) : mediaUrl;
}

/**
 * Message を画像配信URLに解決する（messageType=image かつ media_url がある時のみ）。
 * それ以外（テキスト等）は null。
 */
export function resolveChatMediaUrl(
  messageId: string,
  messageType: string,
  mediaUrl: string | null
): string | null {
  return messageType === "image" && mediaUrl ? chatMediaProxyUrl(messageId) : null;
}
