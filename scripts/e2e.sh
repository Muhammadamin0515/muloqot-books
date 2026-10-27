#!/usr/bin/env bash
# Full local check: unit tests, build, fresh local D1 with migrations, wrangler dev, API + browser scenarios.
# Usage: npm run e2e
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8806}
npm test
npm run build
node tests/fixtures.mjs /tmp/fixtures
WR=
stop(){ if [ -n "$WR" ]; then kill -- -"$WR" 2>/dev/null || true; sleep 1; fi; WR=; }
trap stop EXIT
# every suite starts from an empty local database with all migrations applied
fresh(){
  stop; rm -rf .wrangler/state
  npx wrangler d1 migrations apply muloqot-books --local >/dev/null
  setsid npx wrangler dev --port "$PORT" >/tmp/wrangler-e2e.log 2>&1 &
  WR=$!
  for i in $(seq 1 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && return; sleep 1; done
  echo "wrangler did not start"; exit 1
}
fresh; BASE="http://localhost:$PORT" node tests/e2e/api.mjs
fresh; BASE="http://localhost:$PORT" node tests/e2e/ui.cjs
