import "server-only";

import crypto from "crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Cron ジョブ用の Bearer 認証。
 *
 * - CRON_SECRET 未設定なら常に拒否する（フェイルクローズ。未設定で誰でも叩ける状態を作らない）
 * - 比較は定数時間で行う（`!==` は先頭一致の分だけ早く返るため、理論上は
 *   1文字ずつ総当たりする側の手掛かりになる）
 *
 * 6つのジョブで同じ判定を書いていたものをここに集約する。
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  return timingSafeEqualString(authHeader, `Bearer ${cronSecret}`);
}

/** 長さが違っても早期returnしない定数時間比較。 */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual は長さが違うと例外を投げるため、固定長のダイジェストに揃えてから比較する。
  const hashA = crypto.createHash("sha256").update(bufA).digest();
  const hashB = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}
