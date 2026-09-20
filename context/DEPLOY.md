# The public copy on AWS (read-only)

**Live since 20 Sep 2026, 05:02 EDT: `http://32.198.75.6/` is the marketing page and `http://32.198.75.6/dashboard` is
the workspace**, on one t3.small in us-east-1 (Karan's account), running as a systemd service that restarts itself.
Verified from outside: every page and read answers in about 100 ms; approve, run, accruals, decide and the paid Ask
all answer 403; Ask in code mode and the tools answer. There is no `.env` on the box and no key in the service's
environment, and the month on it has the real Slack member id scrubbed out. It is plain http on an IP: no domain, no
TLS. The live demo, where decisions are made, stays on the laptop.

- **Update it** after new commits or a new month: `scripts/deploy-public.sh 32.198.75.6`. It sends the code as
  committed and a scrubbed copy of `runs/demo/start.db`, swaps them in, restarts the service and checks both answers.
  The SSH key is `~/.ssh/money-maxer-demo.pem` on Karan's laptop; SSH is open only to the address it was deployed from
  (if that changes: add the new address to security group `money-maxer-demo-sg`, port 22).
- **Atharv, for Vercel:** the marketing page's "Open the dashboard" button points at `/dashboard`, which exists only
  on this box. On Vercel it has to be `http://32.198.75.6/dashboard`.
- **Take it down** when judging is over (it costs about 50 cents a day):
  `aws ec2 terminate-instances --region us-east-1 --instance-ids i-0b4b617b2060e0d33`, then
  `aws ec2 delete-security-group --region us-east-1 --group-id sg-02170e069ce23e142` and
  `aws ec2 delete-key-pair --region us-east-1 --key-name money-maxer-demo`.

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
