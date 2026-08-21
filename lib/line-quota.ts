import { logger } from "@/lib/logger";
import type { LineAccountCredentials } from "@/lib/line";

/**
 * LINE公式アカウントの月間メッセージ枠（quota）の取得と判定。
 *
 * 上限・消費数は**LINEの公式APIを真実源**にする:
 *   - 上限はプラン（コミュニケーション=200通/月・ライト=5,000通/月・スタンダード=30,000通/月）
 *     への課金・変更で、デプロイなしに変わる契約依存値。コードに固定すると
 *     プラン変更の瞬間から表示・警告がすべてウソになる。
 *   - 消費数も自前カウントでは LINE Official Account Manager からの手動配信を
 *     取りこぼすため、公式の consumption API を正とする。
 *
 * 上限到達後の push はエラーになり、通知・メッセージ送信が**静かに全停止**する。
 * そうなる前に切り替え時期が分かるよう、比率ベースの警告と月末着地予測を出す。
 */

const LINE_API_BASE = "https://api.line.me/v2/bot";
const FETCH_TIMEOUT_MS = 8_000;
// 管理画面のリロードのたびに外部APIを叩かない（表示用途に十分な鮮度）
const CACHE_TTL_MS = 5 * 60 * 1000;

export type LineQuotaSnapshot = {
  /** 月間上限。null = 上限なし（quota type: none） */
  limit: number | null;
  /** 今月の送信済み数（LINE集計。手動配信も含む） */
  used: number;
};

type CacheEntry = { value: LineQuotaSnapshot; expiresAt: number };
const cache = new Map<string, CacheEntry>();

async function lineGet<T>(accessToken: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${LINE_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`LINE API ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 指定アカウントの今月の枠と消費数を取得する（5分キャッシュ）。
 * 取得できないときは null（呼び出し側は「取得できませんでした」を表示し、
 * 0件・空の断定をしない）。
 */
export async function fetchLineQuotaSnapshot(
  cacheKey: string,
  credentials: Pick<LineAccountCredentials, "accessToken">
): Promise<LineQuotaSnapshot | null> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  try {
    const [quota, consumption] = await Promise.all([
      lineGet<{ type: "none" | "limited"; value?: number }>(
        credentials.accessToken,
        "/message/quota"
      ),
      lineGet<{ totalUsage: number }>(credentials.accessToken, "/message/quota/consumption"),
    ]);

    const value: LineQuotaSnapshot = {
      // type "none" = 上限なし。limited でも value 欠落なら不明として null に倒す
      limit: quota.type === "limited" && typeof quota.value === "number" ? quota.value : null,
      used: consumption.totalUsage ?? 0,
    };
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    logger.warn("line quota fetch failed", {
      cacheKey,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/** テスト・書き込み直後の再取得用 */
export function invalidateLineQuotaCache(): void {
  cache.clear();
}

// =====================================================
// 判定（純関数・単体テストで固定）
// =====================================================

export type QuotaWarnLevel = "safe" | "warning" | "critical";

export type QuotaAssessment = {
  limit: number | null;
  used: number;
  /** 残り。上限なしなら null */
  remaining: number | null;
  /** 使用率 0〜1。上限なしなら null */
  ratio: number | null;
  /** 今のペースで月末までに届く見込みの総数（月初からの平均ペース × 月の日数） */
  projectedMonthEnd: number;
  /** 月末までに上限を超える見込みか（上限なしなら false） */
  willExceed: boolean;
  warnLevel: QuotaWarnLevel;
};

/**
 * 枠の状態を判定する。
 *
 * - 警告は**比率**で決める（絶対値だと上限200と5,000で意味が変わる）:
 *     90%以上 → critical / 70%以上 → warning
 *   ただし残りが少数（20通以下）なら比率に関わらず warning 以上
 *   （上限200の低プランで「残り19通=9.5%」を safe にしない最低値ガード）。
 * - 着地予測は月初からの平均ペース。LINEの枠は暦月でリセットされる。
 *   月初の数日は分母が小さくブレるが、「早めに気づく」方向のブレなので許容する。
 */
export function assessLineQuota(params: {
  snapshot: LineQuotaSnapshot;
  /** 判定時点（JST基準の日付計算に使う） */
  now: Date;
}): QuotaAssessment {
  const { limit, used } = params.snapshot;

  // JSTの「今日が月の何日目か」「今月が何日あるか」
  const jst = new Date(params.now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const dayOfMonth = jst.getDate();
  const daysInMonth = new Date(jst.getFullYear(), jst.getMonth() + 1, 0).getDate();

  const projectedMonthEnd = Math.round((used / Math.max(1, dayOfMonth)) * daysInMonth);

  if (limit === null) {
    return {
      limit,
      used,
      remaining: null,
      ratio: null,
      projectedMonthEnd,
      willExceed: false,
      warnLevel: "safe",
    };
  }

  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? used / limit : 1;
  const willExceed = projectedMonthEnd > limit;

  let warnLevel: QuotaWarnLevel = "safe";
  if (ratio >= 0.9 || remaining <= 0) {
    warnLevel = "critical";
  } else if (ratio >= 0.7 || remaining <= 20 || willExceed) {
    warnLevel = "warning";
  }

  return { limit, used, remaining, ratio, projectedMonthEnd, willExceed, warnLevel };
}
