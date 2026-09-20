#!/usr/bin/env bash
# Between judges: fresh world, desk restarted, ~10 seconds. Then hard-refresh the browser tabs.
set -e
cd "$(dirname "$0")/.."
scripts/demo-serve.sh
scripts/seed-polish.sh
pkill -f "desk/cli.ts" 2>/dev/null || true
sleep 1
nohup pnpm desk runs/demo/live.db > /tmp/desk.log 2>&1 &
echo "next judge ready: hard-refresh the flow page and the dashboard (Cmd+Shift+R)"
