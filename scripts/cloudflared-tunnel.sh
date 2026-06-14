#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-localhost}"
PORT="${PORT:-54321}"
URL="${URL:-http://${HOST}:${PORT}}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed or is not on PATH." >&2
  echo "Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "Starting cloudflared tunnel to ${URL}"
echo "Supabase local S3 endpoint: ${URL}/storage/v1/s3"
exec cloudflared tunnel --url "${URL}"
