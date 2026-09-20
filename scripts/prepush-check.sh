#!/usr/bin/env bash
# Run before every push to main. Three people and their agents push here, so: look at what landed since you last
# synced, make sure nobody's work (yours included) was overwritten, rebase, prove the tree still builds, scan for
# secrets. It changes nothing on the remote. Usage: scripts/prepush-check.sh [paths you own...]   (default: src eval)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
OWNED=("$@"); [ ${#OWNED[@]} -eq 0 ] && OWNED=(src eval package.json)
ME="$(git config user.name)"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "not on main: git checkout main first"; exit 1; }
BEFORE="$(git rev-parse origin/main)"
git fetch --quiet origin
AFTER="$(git rev-parse origin/main)"

echo "== origin/main: $BEFORE -> $AFTER"
if ! git merge-base --is-ancestor "$BEFORE" "$AFTER"; then
  echo "!! origin/main was REWRITTEN (not a fast-forward). Stop and look before doing anything:"
  git log --oneline "$AFTER" -5; exit 2
fi
echo "== commits by others since the last sync, and the files they touched in ${OWNED[*]}:"
git log "$BEFORE..$AFTER" --format='%h %an %s' | grep -v " $ME " || echo "   (none)"
TOUCHED="$(git log "$BEFORE..$AFTER" --format='@@%an' --name-status -- "${OWNED[@]}" | awk -v me="$ME" '/^@@/{a=substr($0,3); next} NF && a!=me {print "   " a ": " $0}')"
if [ -n "$TOUCHED" ]; then echo "!! others changed files you own. Read these diffs before pushing:"; echo "$TOUCHED"; fi

git pull --quiet --rebase --autostash origin main
echo "== deleted since the last sync under ${OWNED[*]}:"
git diff --diff-filter=D --name-only "$BEFORE" HEAD -- "${OWNED[@]}" | sed 's/^/   /' || true

pnpm -s typecheck
pnpm -s test 2>&1 | grep -E "Test Files|Tests|FAIL" || true
if git diff origin/main..HEAD | grep -qE "sk-ant-|xox[bap]-|AIza[0-9A-Za-z_-]{20}"; then echo "!! a secret-shaped string is in the commits about to be pushed"; exit 3; fi
git ls-files --error-unmatch .env >/dev/null 2>&1 && { echo "!! .env is tracked"; exit 3; }
echo "== ok to push: git push origin main   (then: git fetch && git status -sb, to confirm the tip is yours)"
