#!/usr/bin/env bash
# Puts the demo on screen, and puts it back the way it was between rehearsals.
#
#   scripts/demo-serve.sh [runs/demo]
#
#   start.db  the month as the demo begins: prepared.db with the one paid model pass on it. Made once, never served.
#   live.db   a copy of start.db, served on :4320. Everything you click changes this copy only.
#   fresh.db  the world with nothing learned and nothing run, served on :4321, for "do it in front of us".
#
# Run it again at any time to throw away what a rehearsal changed. No model is called from here.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-runs/demo}"
case "$OUT" in runs/*) ;; *) echo "refusing to serve from outside runs/: $OUT" >&2; exit 1 ;; esac
[ -f "$OUT/prepared.db" ] || { echo "no $OUT/prepared.db: run scripts/demo-build.sh first" >&2; exit 1; }

pkill -f "workspace/server.ts $OUT/" 2>/dev/null || true
sleep 1
[ -f "$OUT/start.db" ] || sqlite3 "$OUT/prepared.db" "VACUUM INTO '$OUT/start.db'"
rm -f "$OUT/live.db" "$OUT/live.db-wal" "$OUT/live.db-shm"
cp "$OUT/start.db" "$OUT/live.db"

# The Ask page's agent reads its key from .env. A key exported as nothing would win over .env, so it is unset here.
for pair in "live.db 4320" "fresh.db 4321"; do
  set -- $pair
  env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY nohup pnpm -s workspace "$OUT/$1" --port "$2" > "$OUT/workspace-$2.log" 2>&1 &
done
sleep 2
WAITING=$(sqlite3 "$OUT/live.db" "SELECT COUNT(*) FROM decision d WHERE d.mode='live' AND d.route='PROPOSE' AND d.posted_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)")
cat <<NEXT
The demo:      http://localhost:4320   ($OUT/live.db, reset from start.db; $WAITING item(s) waiting for a person)
From nothing:  http://localhost:4321   ($OUT/fresh.db)
Reset:         scripts/demo-serve.sh   (again; about three seconds)
Stop:          pkill -f "workspace/server.ts $OUT/"
NEXT
