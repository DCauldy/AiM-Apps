#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-6060}"
NEXT_BIN="${NEXT_BIN:-./node_modules/.bin/next}"

if [[ ! -x "${NEXT_BIN}" ]]; then
  echo "Next.js binary not found at ${NEXT_BIN}. Run npm install first." >&2
  exit 1
fi

cat >&2 <<'EOF'
Warning: starting local dev without a public Supabase asset URL.
Third-party providers cannot fetch localhost Supabase assets from this mode.
Use `npm run dev:tunnel` to set PROVIDER_VISIBLE_SUPABASE_URL automatically.

EOF

exec "${NEXT_BIN}" dev -p "${APP_PORT}"
