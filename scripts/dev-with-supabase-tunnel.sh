#!/usr/bin/env bash
set -euo pipefail

LOCAL_SUPABASE_URL="${LOCAL_SUPABASE_URL:-http://127.0.0.1:54321}"
APP_PORT="${APP_PORT:-6060}"
NEXT_BIN="${NEXT_BIN:-./node_modules/.bin/next}"
LOG_FILE="$(mktemp -t aim-cloudflared.XXXXXX.log)"
TUNNEL_PID=""

cleanup() {
  if [[ -n "${TUNNEL_PID}" ]] && kill -0 "${TUNNEL_PID}" >/dev/null 2>&1; then
    kill "${TUNNEL_PID}" >/dev/null 2>&1 || true
    wait "${TUNNEL_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${LOG_FILE}"
}

trap cleanup EXIT INT TERM

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or is not on PATH." >&2
  echo "Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

if [[ ! -x "${NEXT_BIN}" ]]; then
  echo "Next.js binary not found at ${NEXT_BIN}. Run npm install first." >&2
  exit 1
fi

echo "Starting cloudflared tunnel to ${LOCAL_SUPABASE_URL}"
cloudflared tunnel --url "${LOCAL_SUPABASE_URL}" --logfile "${LOG_FILE}" &
TUNNEL_PID="$!"

echo "Waiting for cloudflared tunnel URL..."
TUNNEL_URL=""
for _ in $(seq 1 60); do
  if ! kill -0 "${TUNNEL_PID}" >/dev/null 2>&1; then
    echo "cloudflared exited before a tunnel URL was available." >&2
    cat "${LOG_FILE}" >&2
    exit 1
  fi

  TUNNEL_URL="$(grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "${LOG_FILE}" | tail -n 1 || true)"
  if [[ -n "${TUNNEL_URL}" ]]; then
    break
  fi

  sleep 1
done

if [[ -z "${TUNNEL_URL}" ]]; then
  echo "Timed out waiting for cloudflared tunnel URL." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

echo "PROVIDER_VISIBLE_SUPABASE_URL=${TUNNEL_URL}"
echo "Provider storage base: ${TUNNEL_URL}/storage/v1/object"
echo "Starting Next dev server on http://localhost:${APP_PORT}"

PROVIDER_VISIBLE_SUPABASE_URL="${TUNNEL_URL}" "${NEXT_BIN}" dev -p "${APP_PORT}"
