#!/usr/bin/env bash
# Runs Epic Writer for everyday local use: MongoDB, a production build, the web app and the
# worker. Nightly backups go to BACKUP_DIR from .env, else ~/EpicWriterBackups.
set -euo pipefail
cd "$(dirname "$0")/.."

from_env=$(grep -E '^BACKUP_DIR=.+' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
export BACKUP_DIR="${BACKUP_DIR:-${from_env:-$HOME/EpicWriterBackups}}"
mkdir -p "$BACKUP_DIR"

# The production server only trusts the host Auth.js is told about (dev trusts localhost itself).
url_from_env=$(grep -E '^AUTH_URL=.+' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
export AUTH_URL="${AUTH_URL:-${url_from_env:-http://localhost:3000}}"

docker compose up -d mongo
for _ in $(seq 1 30); do
  docker compose exec -T mongo mongosh --port 27018 --quiet --eval 'db.runCommand({ ping: 1 })' \
    >/dev/null 2>&1 && break
  sleep 1
done

pnpm --filter @epic/db exec tsx --env-file=../../.env scripts/create-indexes.ts
pnpm build

echo "Epic Writer: http://localhost:3000  (backups: $BACKUP_DIR, Ctrl+C to stop)"
trap 'kill 0' EXIT
pnpm --filter @epic/web start &
(cd apps/worker && pnpm exec tsx --env-file=../../.env main.ts) &
wait
