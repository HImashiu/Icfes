#!/usr/bin/env bash
# Builds the web app with the backend settings and zips dist/ for the Cloudflare upload.
# Usage: scripts/pack-web.sh <supabase-url> <publishable-key> <out.zip>
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_SUPABASE_URL="$1" VITE_SUPABASE_ANON_KEY="$2" npx vite build >/dev/null
rm -f "$3"
(cd dist && zip -qr "$3" .)
echo "wrote $3"
