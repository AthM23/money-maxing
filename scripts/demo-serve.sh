#!/usr/bin/env bash
# Puts the demo on screen, and puts it back the way it was between rehearsals.
#
#   scripts/demo-serve.sh [--keep] [runs/demo]     --keep restarts the servers on new code and leaves the copies as they are
#
#   start.db  the month as the demo begins: prepared.db with the one paid model pass on it. Made once, never served.
#   live.db   a copy of start.db, served on :4320. Everything you click changes this copy only.
#   fresh.db  the world with nothing learned and nothing run. Never served: a copy of it, nothing.db, is on :4321 for
#             "do it in front of us", so that can be rehearsed and reset too.
#
# Run it again at any time to throw away what a rehearsal changed. No model is called from here.
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP=0; [ "${1:-}" = "--keep" ] && { KEEP=1; shift; }
OUT="${1:-runs/demo}"
case "$OUT" in runs/*) ;; *) echo "refusing to serve from outside runs/: $OUT" >&2; exit 1 ;; esac
[ -f "$OUT/prepared.db" ] || { echo "no $OUT/prepared.db: run scripts/demo-build.sh first" >&2; exit 1; }

pkill -f "workspace/server.ts $OUT/" 2>/dev/null || true
sleep 1
[ -f "$OUT/start.db" ] || sqlite3 "$OUT/prepared.db" "VACUUM INTO '$OUT/start.db'"
if [ "$KEEP" = 0 ] || [ ! -f "$OUT/live.db" ] || [ ! -f "$OUT/nothing.db" ]; then
  for copy in live nothing; do rm -f "$OUT/$copy.db" "$OUT/$copy.db-wal" "$OUT/$copy.db-shm"; done
  cp "$OUT/start.db" "$OUT/live.db"
  sqlite3 "$OUT/fresh.db" "VACUUM INTO '$OUT/nothing.db'"
fi

# The Ask page's agent reads its key from .env. A key exported as nothing would win over .env, so it is unset here.
for pair in "live.db 4320" "nothing.db 4321"; do
  set -- $pair
  env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY nohup pnpm -s workspace "$OUT/$1" --port "$2" > "$OUT/workspace-$2.log" 2>&1 &
done
sleep 2
WAITING=$(sqlite3 "$OUT/live.db" "SELECT COUNT(*) FROM decision d WHERE d.mode='live' AND d.route='PROPOSE' AND d.posted_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id)")
cat <<NEXT
The demo:      http://localhost:4320/dashboard   (marketing page at /; $OUT/live.db$([ "$KEEP" = 1 ] && echo ', kept as it was' || echo ', reset from start.db'); $WAITING item(s) waiting for a person)
From nothing:  http://localhost:4321/dashboard   ($OUT/nothing.db, a copy of fresh.db: Learn, approve the rule, Run the code tier)
Reset:         scripts/demo-serve.sh          (again; about three seconds)
New code:      scripts/demo-serve.sh --keep   (restarts the servers, keeps what you clicked)
Stop:          pkill -f "workspace/server.ts $OUT/"
NEXT
