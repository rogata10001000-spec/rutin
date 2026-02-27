type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as typeof globalThis & {
  __rateLimitStore?: Map<string, Bucket>;
};

const store = globalStore.__rateLimitStore ?? new Map<string, Bucket>();
if (!globalStore.__rateLimitStore) {
  globalStore.__rateLimitStore = store;
}

export function checkRateLimit(params: {
  key: string;
  windowMs: number;
  maxRequests: number;
}): boolean {
  const now = Date.now();
  const current = store.get(params.key);
  if (!current || current.resetAt < now) {
    store.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return true;
  }

  current.count += 1;
  return current.count <= params.maxRequests;
}

export function requestKey(request: Request, scope: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
  return `${scope}:${forwardedFor}`;
}
