# Putting a copy on the internet (read-only)

Written 20 Sep 2026, 03:40 EDT. Nothing has been deployed. This is the ten-minute version for when Karan says go; it
creates billable AWS resources, so it is run by a person or with their explicit go-ahead, not on a schedule.

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
