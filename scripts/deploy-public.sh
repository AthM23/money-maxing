#!/usr/bin/env bash
# Updates the public, read-only copy: the code as committed and the month as the demo begins, with real Slack member
# ids scrubbed from the copy. Nothing secret is sent: no .env, no key, and the box needs none (WORKSPACE_PUBLIC=1).
#
#   scripts/deploy-public.sh <host> [ssh key, default ~/.ssh/money-maxer-demo.pem] [month db, default runs/demo/start.db]
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:?usage: scripts/deploy-public.sh <host> [ssh key] [month db]}"
KEY="${2:-$HOME/.ssh/money-maxer-demo.pem}"
MONTH="${3:-runs/demo/start.db}"
[ -f "$MONTH" ] || { echo "no $MONTH: run scripts/demo-build.sh first" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "commit first: the box gets the code as committed (git archive HEAD)" >&2; exit 1; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
git archive --format=tar.gz -o "$WORK/mm.tgz" HEAD
sqlite3 "$MONTH" "VACUUM INTO '$WORK/month.db'"
python3 - "$WORK/month.db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
real = [r[0] for r in db.execute("SELECT DISTINCT slack_user FROM approver WHERE slack_user GLOB 'U0*' UNION SELECT DISTINCT owner_user FROM party WHERE owner_user GLOB 'U0*'")]
tables = [t for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
for table in tables:
    for col in [c[1] for c in db.execute(f"PRAGMA table_info({table})")]:
        for rid in real:
            db.execute(f"UPDATE {table} SET {col} = REPLACE({col}, ?, 'U_DEMO_PERSON') WHERE CAST({col} AS TEXT) LIKE ?", (rid, f"%{rid}%"))
db.commit()
left = sum(db.execute(f"SELECT COUNT(*) FROM {t} WHERE CAST({c[1]} AS TEXT) LIKE ?", (f"%{rid}%",)).fetchone()[0] for t in tables for c in db.execute(f"PRAGMA table_info({t})").fetchall() for rid in real)
assert left == 0, f"{left} real Slack id(s) left in the public copy"
print(f"public copy: {len(real)} real Slack id(s) scrubbed, 0 left")
PY
if strings "$WORK/month.db" | grep -qE "sk-ant-|xox[bap]-|xapp-|GOCSPX|RT1-|pat-na"; then echo "a secret-shaped string is in the month: not deploying" >&2; exit 3; fi
scp -q -i "$KEY" "$WORK/mm.tgz" "$WORK/month.db" "ec2-user@$HOST:/tmp/"
ssh -i "$KEY" "ec2-user@$HOST" 'set -e; rm -rf ~/mm.new && mkdir -p ~/mm.new && tar -xzf /tmp/mm.tgz -C ~/mm.new && cd ~/mm.new && pnpm install --frozen-lockfile >/dev/null 2>&1 && mkdir -p runs/public && cp /tmp/month.db runs/public/month.db && sudo systemctl stop money-maxer.service && rm -rf ~/mm.old && mv ~/mm ~/mm.old && mv ~/mm.new ~/mm && sudo systemctl start money-maxer.service && sleep 3 && systemctl is-active money-maxer.service'
curl -s -o /dev/null -m 10 -w "http://$HOST/dashboard -> %{http_code}\n" "http://$HOST/dashboard"
curl -s -o /dev/null -m 10 -w "a write on the public copy -> %{http_code} (403 is right)\n" -X POST -H "content-type: application/json" -H "origin: http://$HOST" "http://$HOST/api/do/run" -d '{}'
