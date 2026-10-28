#!/usr/bin/env bash
# Full local check: unit tests, build, fresh local D1 with migrations, wrangler dev, API + browser scenarios.
# Usage: npm run e2e
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8806}
export IMPORT_TOKEN=${IMPORT_TOKEN:-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d " \n")}
npm test
npm run build
node tests/fixtures.mjs /tmp/fixtures
WR=
stop(){ if [ -n "$WR" ]; then kill -- -"$WR" 2>/dev/null || true; sleep 1; fi; WR=; }
trap stop EXIT
# every suite starts from an empty local database with all migrations applied
fresh(){
  stop; rm -rf .wrangler/state; EXTRA="${1:-}"
  npx wrangler d1 migrations apply muloqot-books --local >/dev/null
  setsid npx wrangler dev --port "$PORT" --var IMPORT_TOKEN:"$IMPORT_TOKEN" $EXTRA >/tmp/wrangler-e2e.log 2>&1 &
  WR=$!
  for i in $(seq 1 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && return; sleep 1; done
  echo "wrangler did not start"; exit 1
}
fresh; BASE="http://localhost:$PORT" node tests/e2e/api.mjs
fresh "--var BOT_TOKEN:123456:FAKETOKEN --var TG_API:http://localhost:9999 --var ADMIN_IDS:1 --var WEBAPP_URL:http://localhost:$PORT --var AI_BASE:http://localhost:9999/ai"; BASE="http://localhost:$PORT" node tests/e2e/broadcast.mjs
fresh; BASE="http://localhost:$PORT" node tests/e2e/ruslit.mjs
fresh; BASE="http://localhost:$PORT" node tests/e2e/ruslit-ui.cjs
fresh; BASE="http://localhost:$PORT" node tests/e2e/ui.cjs
