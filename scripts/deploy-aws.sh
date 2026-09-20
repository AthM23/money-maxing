#!/usr/bin/env bash
# Updates the workspace on the AWS box: the code as committed, the month as the demo begins, and its stores.
# The box runs the FULL workspace bound to localhost; Caddy in front of it is the only way in (https, one password).
# Sent: no .env, no key (the key lives in /etc/money-maxer.env on the box, put there once, by hand, root-only), and a
# copy of the month with real Slack member ids scrubbed.
#
#   scripts/deploy-aws.sh <ip> [--reset]      --reset also puts the month on the box back to the start
#
# If ssh times out, your address changed: add it to security group money-maxer-demo-sg, port 22 (the key is required anyway).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:?usage: scripts/deploy-aws.sh <ip> [--reset]}"
RESET="${2:-}"
KEY="${MM_SSH_KEY:-$HOME/.ssh/money-maxer-demo.pem}"
MONTH="${MM_MONTH:-runs/demo/start.db}"
[ -f "$MONTH" ] || { echo "no $MONTH: run scripts/demo-build.sh first" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "commit first: the box gets the code as committed (git archive HEAD)" >&2; exit 1; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
git archive --format=tar.gz -o "$WORK/mm.tgz" HEAD
sqlite3 "$MONTH" "VACUUM INTO '$WORK/start.db'"
python3 - "$WORK/start.db" <<'PY'
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
assert left == 0, f"{left} real Slack id(s) left in the copy"
print(f"month: {len(real)} real Slack id(s) scrubbed, 0 left")
PY
if strings "$WORK/start.db" | grep -qE "sk-ant-|xox[bap]-|xapp-|GOCSPX|RT1-|pat-na"; then echo "a secret-shaped string is in the month: not deploying" >&2; exit 3; fi
COPYFILE_DISABLE=1 tar -czf "$WORK/stores.tgz" -C "$(dirname "$MONTH")" stores
scp -q -i "$KEY" -o ConnectTimeout=10 "$WORK/mm.tgz" "$WORK/start.db" "$WORK/stores.tgz" "ec2-user@$HOST:/tmp/"
ssh -i "$KEY" "ec2-user@$HOST" "set -e; rm -rf ~/mm.new && mkdir -p ~/mm.new && tar -xzf /tmp/mm.tgz -C ~/mm.new 2>/dev/null && cd ~/mm.new && pnpm install --frozen-lockfile >/dev/null 2>&1
  mkdir -p runs && cp -a ~/mm/runs/live runs/live && cp /tmp/start.db runs/live/start.db && rm -rf runs/live/stores && tar -xzf /tmp/stores.tgz -C runs/live 2>/dev/null
  sudo systemctl stop money-maxer.service && rm -rf ~/mm.old && mv ~/mm ~/mm.old && mv ~/mm.new ~/mm && sudo systemctl start money-maxer.service
  [ '$RESET' = '--reset' ] && mm-reset >/dev/null; sleep 3; echo \"workspace: \$(systemctl is-active money-maxer.service) · caddy: \$(systemctl is-active caddy.service)\""
SITE="https://$(echo "$HOST" | tr . -).sslip.io"
curl -s -o /dev/null -m 15 -w "$SITE/dashboard without the password -> %{http_code} (401 is right)\n" "$SITE/dashboard"
