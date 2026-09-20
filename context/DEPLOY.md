# Putting a copy on the internet (read-only)

Written 20 Sep 2026, 03:40 EDT. The box below has not been deployed; the Vercel copy has. The box is the ten-minute version for when Karan says go; it
creates billable AWS resources, so it is run by a person or with their explicit go-ahead, not on a schedule.

## On Vercel (done 20 Sep 2026, ~04:35 EDT): https://money-maxing-mu.vercel.app

Free, TLS, one address: `/` is the marketing page, `/dashboard` the workspace. Vercel project `money-maxing` under
AthM23's account (`a1ms-projects`). It is the same read-only copy described below, as one function:

- `workspace/vercel.ts` calls the same handler as `pnpm workspace` (`workspace/app.ts`) with read-only **hard-coded**,
  not read from `WORKSPACE_PUBLIC`: no setting on the host can make it a workspace that writes or spends. No
  environment variable is set on the project and none is needed.
- `scripts/vercel-build.mjs` (the build command in `vercel.json`) builds the month on Vercel's machine with
  `scripts/demo-build.sh` — no model call, about 20 seconds — so **no database is committed or uploaded**: the copy is
  `prepared.db` from the code as deployed. Vercel has no `sqlite3` command; `scripts/vercel/bin/sqlite3` stands in for
  the one form the script uses. The function's disk is read-only, so the month is opened from a copy in the temp folder.
- To show the month **with the paid pass on it** instead: put it at `runs/snapshot/month.db` and deploy from that
  machine; the build uses it as provided and skips the rebuild. `.vercelignore` lets that one path through.

```bash
npx vercel deploy          # a preview, behind Vercel's login; check it with: npx vercel curl /dashboard --deployment <url>
npx vercel deploy --prod   # the public address above
```

**Not connected to GitHub, on purpose, until this is on `main`**: a push to a `main` without `vercel.json` would publish
the repo's files as a static site over the working copy. After the merge: `npx vercel git connect`.

`.vercelignore` replaces `.gitignore` for the CLI, so `.env` is named in it; keep it named.

## What goes up, and what never does

`WORKSPACE_PUBLIC=1` starts the workspace **read-only** (`workspace/publicMode.ts`, tested): every action that writes
or spends is refused by name (answer, approve, decide, fact, learn, policy, run), Ask answers from code only, and only
in this mode will the server listen beyond 127.0.0.1. The books as tools, every page, the trace, the Model page and
the audit (it works on a temporary copy) all work. **No `.env`, no API key, no Slack or QuickBooks credential goes on
the box**: the public copy has nothing to call them with. The live demo, where decisions are made, stays on the laptop.

## One small box

```bash
# on the laptop: the code as committed, plus the month as the demo begins
git archive --format=tar.gz -o /tmp/mm.tgz HEAD
scp /tmp/mm.tgz runs/demo/start.db ec2-user@<host>:/tmp/

# on the box (Amazon Linux 2023, t3.small is plenty): Node 22 and pnpm, then
mkdir -p ~/mm && tar -xzf /tmp/mm.tgz -C ~/mm && cd ~/mm && corepack enable && pnpm install --frozen-lockfile
mkdir -p runs/public && cp /tmp/start.db runs/public/month.db
WORKSPACE_PUBLIC=1 nohup pnpm -s workspace runs/public/month.db --port 8080 > workspace.log 2>&1 &
```

Open port 8080 in the instance's security group to the judges' network or to everyone, as Karan decides. `/` is the
marketing page, `/dashboard` the workspace. To refresh the copy, replace `month.db` and restart.

## Not done, on purpose

No TLS and no domain (an IP and a port are enough for a judge's click; put a load balancer or Caddy in front for
either). No password: the copy cannot write, spend or reveal a secret, and the data is a fictional company's.
If the marketing page is hosted elsewhere (Vercel), set `MARKETING_URL` and the root redirects to it; its
"Dashboard" link must then point at this box, not at `/dashboard`.
