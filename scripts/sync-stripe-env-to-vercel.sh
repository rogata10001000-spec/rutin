#!/usr/bin/env bash
# Vercel 本番環境へ Stripe 関連 env を同期（要: vercel login 済み）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  VERCEL=(npx --yes vercel)
else
  VERCEL=(vercel)
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

VARS=(
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_LIGHT
  STRIPE_PRICE_STANDARD
  STRIPE_PRICE_PREMIUM
)

for name in "${VARS[@]}"; do
  value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "skip $name (empty)"
    continue
  fi
  echo "Setting $name on Vercel production..."
  printf '%s' "$value" | "${VERCEL[@]}" env add "$name" production --force
done

echo "Done. Redeploy production for changes to take effect."
