#!/usr/bin/env bash
# Builds the demo databases from the code as it stands, with no model call and no live system.
#
#   scripts/demo-build.sh [runs/demo]
#
#   fresh.db     the seeded world, ingested from its bank files, mail and chat. Nothing learned, nothing run.
#                For "do it in front of us": Learn, approve the rule, Run the code tier, all from the workspace.
#   prepared.db  the same world after Learn (twice: the second replay is what earns the rule its autonomy), the code
#                tier, and the close checks. The one question a person has to answer is added by the paid step this
#                script prints at the end; it is never run from here.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-runs/demo}"
case "$OUT" in runs/*) ;; *) echo "refusing to build outside runs/: $OUT" >&2; exit 1 ;; esac

# A variable that is set, even to nothing, wins over .env: this run cannot reach a paid model.
export ANTHROPIC_API_KEY= OPENAI_API_KEY= FT_ENDPOINT_URL= FOOTNOTE_READER_URL=
export FOOTNOTE_WORLD=global-july

rm -rf "$OUT" && mkdir -p "$OUT"
echo "== fresh.db: seed the world and ingest its bank files, mail and chat"
FOOTNOTE_DB="$OUT/fresh.db" FOOTNOTE_STORES="$OUT/stores" pnpm -s seed --target=local --world=global-july --reset | tail -1
FOOTNOTE_DB="$OUT/fresh.db" FOOTNOTE_STORES="$OUT/stores" pnpm -s ingest | tail -1
# The payables side (two vendors, three months of paid bills, none for July) is what gives the close something to accrue.
pnpm -s demo:payables "$OUT/fresh.db"

echo "== prepared.db: learn, approve the rule, replay again, run the code tier, run the close checks"
sqlite3 "$OUT/fresh.db" "VACUUM INTO '$OUT/prepared.db'"
pnpm -s learn "$OUT/prepared.db" --replay --approve-as U_CTRL | grep -E "^draft|leave-one-out" || true
pnpm -s learn "$OUT/prepared.db" --replay | grep -E "→ (auto|review|shadow)" || true
pnpm -s worker "$OUT/prepared.db" --code-only | grep -E "decisions|tick marks"
# Not `pnpm spine`: without a key it sends a scripted tier 1 over every open case, and a real model pass then finds none open.
pnpm -s downstream "$OUT/prepared.db" --stores "$OUT/stores"
pnpm -s accruals "$OUT/prepared.db" 2026-07

MOVING=$(sqlite3 "$OUT/prepared.db" "SELECT id FROM intent WHERE function = 'close' AND status = 'open' AND json_extract(case_json, '\$.accrual.account') IS NOT NULL LIMIT 1")
MAIN=$(sqlite3 "$OUT/prepared.db" "SELECT id FROM intent WHERE json_extract(case_json, '\$.bank_txn_id') = 'BTX-320' LIMIT 1")
cat <<NEXT

Built $OUT/fresh.db and $OUT/prepared.db with no model call.

1. The paid steps (Haiku first: about 100 seconds and 10 cents each when it settles it; the tier caps sum to \$2.25 each):
     env -u ANTHROPIC_API_KEY pnpm worker $OUT/prepared.db --intent $MAIN          # the wire's held-back 2,200
     env -u ANTHROPIC_API_KEY pnpm worker $OUT/prepared.db --intent $MOVING        # the hosting accrual: usage moves, so it is read, not averaged
2. Put it on screen, and reset it between rehearsals:
     scripts/demo-serve.sh $OUT
NEXT
