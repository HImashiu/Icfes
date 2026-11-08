#!/usr/bin/env bash
# One-command deploy of the public site to Cloudflare (condoricfes.com; condor.juandabarrios12.workers.dev keeps working).
#   cd app && npm run deploy
# Needs: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; app/.env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY;
# exam data in $ICFES_DATA_DIR (default /mnt/project-files/icfes/data). Optional at build: CF_ANALYTICS_TOKEN,
# GA_MEASUREMENT_ID, GOOGLE_SITE_VERIFICATION. SKIP_BUILD=1 redeploys the existing site-dist as it is.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
PY="$(command -v python3 || command -v python)"
if [ "${SKIP_BUILD:-}" != "1" ]; then
  npm run build:site
  # Figures inside the exam JSON are the bulk of the site (~490 MB raw); Cloudflare caps each asset at 25 MiB.
  SHRINK=../tools/shrink-site
  "$PY" -I "$SHRINK/svgmin.py" site-dist/app
  "$PY" -I "$SHRINK/svgutf8.py" site-dist/app
  "$PY" -I "$SHRINK/recompress.py" site-dist/app 1000 64
fi
echo "site-dist: $(du -sh site-dist | cut -f1)"
# The worker checks sign-ins with Supabase: same public URL and key the app ships, read from .env.local.
envval() { { grep -hsE "^\s*$1\s*=" .env .env.production .env.local .env.production.local || true; } | tail -1 | sed -E 's/^[^=]*=\s*//; s/^["'"'"']//; s/["'"'"']\s*$//'; }
SUPA_URL="${VITE_SUPABASE_URL:-$(envval VITE_SUPABASE_URL)}"
SUPA_KEY="${VITE_SUPABASE_ANON_KEY:-$(envval VITE_SUPABASE_ANON_KEY)}"
: "${SUPA_URL:?VITE_SUPABASE_URL missing}"
: "${SUPA_KEY:?VITE_SUPABASE_ANON_KEY missing}"
npx wrangler deploy --var "SUPABASE_URL:$SUPA_URL" --var "SUPABASE_ANON_KEY:$SUPA_KEY"
