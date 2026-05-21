import { getServerEnv } from "@/lib/env";

const base = () => getServerEnv().APP_BASE_URL.replace(/\/$/, "");

export const SUBSCRIBE_PATHS = {
  cast: "/subscribe/cast",
  plan: "/subscribe/plan",
  complete: "/subscribe/complete",
  root: "/subscribe",
} as const;

/** クエリを維持した cast ページ URL（サーバー用） */
export function buildSubscribeCastUrl(params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") qs.set(key, value);
    }
  }
  const query = qs.toString();
  return query ? `${SUBSCRIBE_PATHS.cast}?${query}` : SUBSCRIBE_PATHS.cast;
}

export function buildSubscribePlanUrl(castId: string, extra?: URLSearchParams | string): string {
  const qs = new URLSearchParams({ castId });
  if (typeof extra === "string") {
    const more = new URLSearchParams(extra.startsWith("?") ? extra.slice(1) : extra);
    more.forEach((v, k) => {
      if (k !== "castId") qs.set(k, v);
    });
  } else if (extra) {
    extra.forEach((v, k) => {
      if (k !== "castId") qs.set(k, v);
    });
  }
  return `${SUBSCRIBE_PATHS.plan}?${qs.toString()}`;
}

export function subscribeCheckoutCancelUrl(): string {
  return `${base()}${SUBSCRIBE_PATHS.cast}?canceled=1`;
}

export function subscribeCheckoutSuccessUrl(): string {
  return `${base()}${SUBSCRIBE_PATHS.complete}?session_id={CHECKOUT_SESSION_ID}`;
}
