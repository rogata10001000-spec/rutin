import { getServerEnv } from "@/lib/env";

type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as typeof globalThis & {
  __rateLimitStore?: Map<string, Bucket>;
};

const store = globalStore.__rateLimitStore ?? new Map<string, Bucket>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

export type RateLimitParams = {
  key: string;
  windowMs: number;
  maxRequests: number;
};

/** インスタンス内メモリでのレート制限（フォールバック・従来挙動）。 */
function checkInMemory(params: RateLimitParams): boolean {
  const now = Date.now();
  const current = store.get(params.key);
  if (!current || current.resetAt < now) {
    store.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= params.maxRequests;
}

/**
 * Upstash Redis (REST) を用いた分散レート制限。
 * INCR でカウントし、初回のみ PEXPIRE(NX) で TTL を設定する（1往復のpipeline）。
 * 失敗時は null を返し、呼び出し側で fail-open（メモリ制限へフォールバック）させる。
 */
async function checkUpstash(
  url: string,
  token: string,
  params: RateLimitParams
): Promise<boolean | null> {
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", params.key],
        ["PEXPIRE", params.key, params.windowMs, "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result?: number }>;
    const count = data?.[0]?.result;
    if (typeof count !== "number") return null;
    return count <= params.maxRequests;
  } catch {
    return null;
  }
}

/**
 * レート制限チェック。許可なら true。
 * Upstash 設定時は分散制限、未設定または障害時はインスタンス内メモリにフォールバック（fail-open）。
 */
export async function checkRateLimit(params: RateLimitParams): Promise<boolean> {
  const env = getServerEnv();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const result = await checkUpstash(url, token, params);
    if (result !== null) return result;
    // Redis 障害時は決済/重要処理を止めないよう、メモリ制限にフォールバック
  }

  return checkInMemory(params);
}

export function requestKey(request: Request, scope: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
  return `${scope}:${forwardedFor}`;
}
