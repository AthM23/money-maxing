# The hosted copies: AWS (the whole workspace) and Vercel (read-only)

## On AWS: the whole workspace, behind a password — https://32-198-75-6.sslip.io

**Full since 20 Sep 2026, 05:22 EDT.** `/` is the marketing page, open to anyone. `/dashboard` is the workspace and
asks for the team password once: the same sign-in form and thirty-day cookie as the Vercel copy (`workspace/gate.ts`),
and the same password, which is not in the repo. Signed in, it is the workspace as it runs on a laptop: decide,
approve, run the code tier, find unbilled expenses, learn, audit, and Ask with Haiku or Opus. One t3.small in
us-east-1 (Karan's account), about 50 cents a day.

How it is put together (`scripts/aws-box-setup.sh` builds all of it, and was run on this box):

- `money-maxer.service` (systemd, restarts itself) runs `pnpm -s workspace runs/live/month.db --port 4320 --stores
  runs/live/stores`, **bound to 127.0.0.1**. It is started without `WORKSPACE_PUBLIC`, so it is not read-only, and
  without that flag the server listens nowhere but its own machine. The unit refuses to start if
  `DASHBOARD_PASSWORD` is missing (checked both ways on the box): a full workspace is never online without a gate.
- Caddy is the only way in: ports 80 and 443, a Let's Encrypt certificate for the `sslip.io` name (it resolves to the
  IP written in it; no domain was bought), plain http redirected to https. It adds TLS and nothing else. Port 4320
  does not answer from outside.
- `/etc/money-maxer.env` (root only, mode 600) holds two values and nothing else: `ANTHROPIC_API_KEY`, which only Ask
  uses, and `DASHBOARD_PASSWORD`. Neither is in the repo or in anything the scripts send; both were put there by
  hand. **No Slack, QuickBooks, Gmail or HubSpot credential is on the box**, so nothing there can message a person or
  touch a real ledger, and the month on it has the real Slack member id scrubbed out.
- What a visitor can spend: nothing without the password. With it, only Ask calls a paid model, and the unit sets
  `ASK_AGENT_MAX_PER_HOUR=60`. "Run the code tier" and every other button is code.

Checked from outside at 05:22: with no cookie, `/`, `/site` and `/logo.svg` answer 200 and everything else answers
401 (`/dashboard`, its scripts and styles, every `/api/` read, `run`, the paid Ask, a wrong password). The cookie is
`HttpOnly; SameSite=Lax; Secure`. Signed in: pages and reads in about 100 ms; `run` and `accruals` go through and the
other books refresh; one Haiku question came back in 5.4 s through two tools (9,198 tokens in, 378 out, about a cent).

- **Update it** after new commits or a new month: `scripts/deploy-aws.sh 32.198.75.6` (add `--reset` to also put the
  month back to the start). It sends the code as committed, a scrubbed copy of `runs/demo/start.db` and its stores,
  swaps them in, restarts, and checks that the dashboard refuses a visitor who has not signed in. It refuses a month
  that holds a secret-shaped string.
- **Reset the month** after a rehearsal or a judge's visit, three seconds:
  `ssh -i ~/.ssh/money-maxer-demo.pem ec2-user@32.198.75.6 mm-reset`
- **Change the password:** edit `DASHBOARD_PASSWORD` in `/etc/money-maxer.env` on the box, then
  `sudo systemctl restart money-maxer.service`. Everyone is signed out.
- **SSH** is key-only (`~/.ssh/money-maxer-demo.pem` on Karan's laptop) and open to `104.28.0.0/16`, because the
  laptop's outbound address rotates inside that range. If ssh times out, add the new address to security group
  `money-maxer-demo-sg`, port 22.
- **Take it down** when judging is over. This also destroys the only copy of the key that is off the laptop:
  `aws ec2 terminate-instances --region us-east-1 --instance-ids i-0b4b617b2060e0d33`, then
  `aws ec2 delete-security-group --region us-east-1 --group-id sg-02170e069ce23e142` and
  `aws ec2 delete-key-pair --region us-east-1 --key-name money-maxer-demo`.

## On Vercel (done 20 Sep 2026, ~04:35 EDT): https://money-maxing-mu.vercel.app

Free, TLS, one address: `/` is the marketing page, `/dashboard` the workspace. Vercel project `money-maxing` under
AthM23's account (`a1ms-projects`). It is the same read-only copy described below, as one function:

- `workspace/vercel.ts` calls the same handler as `pnpm workspace` (`workspace/app.ts`) with read-only **hard-coded**,
  not read from `WORKSPACE_PUBLIC`: no setting on the host can make it a workspace that writes or spends.
- **The dashboard asks for a password** (`workspace/gate.ts`, since ~04:50): the marketing page is open; `/dashboard`, its
  files and every `/api/` address answer 401 until the password is entered at the form, and the browser is then
  remembered for thirty days (an HttpOnly cookie holding a keyed hash, not the password). The password is the Vercel
  project's one environment variable, `DASHBOARD_PASSWORD` (Production and Preview); ask AthM23 for it, it is not in
  the repo. Unset, the hosted copy serves the marketing page and nothing else. To change it:
  `npx vercel env rm DASHBOARD_PASSWORD production`, `env add`, redeploy; everyone is signed out. The same variable
  gates `pnpm workspace` on a laptop if set; unset, the laptop has no gate.
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

**Every push to `main` redeploys it** (since 20 Sep 2026, 05:22 EDT): `.github/workflows/deploy-vercel.yml` runs
`vercel deploy --prod` with the repository secret `VERCEL_TOKEN` (a token from AthM23's Vercel account), whoever wrote
the commit; the build still happens on Vercel, about 20 seconds. Without the secret the job does nothing and passes. A
failed build leaves the last good copy up. The project is **not** connected through Vercel's GitHub app (refused at
05:13: private repository, app not given access), so there are no preview deployments for branches. By hand, from any
checkout signed in to the project, the two commands above still work. Vercel's Hobby limit is about 100 deployments a
day (UNVERIFIED, from their published limits).

`.vercelignore` replaces `.gitignore` for the CLI, so `.env` is named in it; keep it named.

## Read-only mode, which the Vercel copy runs in

`WORKSPACE_PUBLIC=1` starts the workspace **read-only** (`workspace/publicMode.ts`, tested): every action that writes
or spends is refused by name (answer, approve, decide, fact, learn, policy, run, accruals), Ask answers from code
only, and only in this mode will the server itself listen beyond 127.0.0.1. The books as tools, every page, the
trace, the Model page and the audit (it works on a temporary copy) all work. A read-only copy needs no `.env`, no API
key and no credential of any kind, and the Vercel copy has none. The AWS box ran this way from 05:02 to 05:12 on
20 Sep, on plain http, before it was made the full workspace above.

If the marketing page is hosted somewhere else, set `MARKETING_URL` and the root redirects to it; its "Open the
dashboard" button must then point at a host that serves `/dashboard`.
