#!/usr/bin/env bash
# Runs ON the box, once (Amazon Linux 2023, a t3.small is plenty): the full workspace bound to this machine only,
# with Caddy in front for https. Safe to run again. After it, scripts/deploy-aws.sh keeps the box up to date.
#
#   scp mm.tgz start.db stores.tgz to /tmp on the box (scripts/deploy-aws.sh shows how each is made), then
#   SITE=<ip-with-dashes>.sslip.io bash aws-box-setup.sh
#
# It takes no secret and writes none. The two the box needs go in by hand, as root, into /etc/money-maxer.env
# (root:root, mode 600): ANTHROPIC_API_KEY, which only Ask uses, and DASHBOARD_PASSWORD, the sign-in. Until
# DASHBOARD_PASSWORD is there the unit below will not start: a full workspace is never on the internet without it.
set -euo pipefail
: "${SITE:?SITE=<ip-with-dashes>.sslip.io}"
NODE=v22.21.1
command -v node >/dev/null 2>&1 || curl -fsSL "https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.xz" | sudo tar -xJ -C /usr/local --strip-components=1
command -v pnpm >/dev/null 2>&1 || sudo /usr/local/bin/npm install -g pnpm@11.11.0
if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /tmp/caddy && sudo install -m 755 /tmp/caddy /usr/local/bin/caddy
fi
id caddy >/dev/null 2>&1 || sudo useradd --system --home /var/lib/caddy --create-home --shell /sbin/nologin caddy

# TLS and nothing else: the password is the workspace's own (workspace/gate.ts). The marketing page is open;
# /dashboard, its files and every /api/ address need the sign-in cookie.
sudo mkdir -p /etc/caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$SITE {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4320
}
CADDY
sudo tee /etc/systemd/system/caddy.service >/dev/null <<UNIT
[Unit]
Description=Caddy (https in front of the workspace)
After=network-online.target
[Service]
User=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
[Install]
WantedBy=multi-user.target
UNIT

# The code and the month. runs/live/start.db is what mm-reset goes back to.
sudo systemctl stop money-maxer.service 2>/dev/null || true
rm -rf ~/mm.new && mkdir -p ~/mm.new && tar -xzf /tmp/mm.tgz -C ~/mm.new && cd ~/mm.new && pnpm install --frozen-lockfile >/dev/null 2>&1
mkdir -p runs/live && cp /tmp/start.db runs/live/start.db && cp /tmp/start.db runs/live/month.db && tar -xzf /tmp/stores.tgz -C runs/live
rm -rf ~/mm.old && { [ -d ~/mm ] && mv ~/mm ~/mm.old || true; } && mv ~/mm.new ~/mm

# Everything the workspace can do, on 127.0.0.1 only: without WORKSPACE_PUBLIC the server listens nowhere else.
sudo tee /etc/systemd/system/money-maxer.service >/dev/null <<'UNIT'
[Unit]
Description=Money Maxer workspace (full, bound to localhost; Caddy is the only way in)
After=network-online.target
[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/mm
EnvironmentFile=/etc/money-maxer.env
Environment=ASK_AGENT_MAX_PER_HOUR=60
ExecStartPre=/bin/sh -c 'test -n "$$DASHBOARD_PASSWORD"'
ExecStart=/usr/local/bin/pnpm -s workspace runs/live/month.db --port 4320 --stores runs/live/stores
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
UNIT
sudo tee /usr/local/bin/mm-reset >/dev/null <<'RESET'
#!/usr/bin/env bash
# Puts the month back the way the demo begins. Three seconds; nothing else changes.
set -euo pipefail
sudo systemctl stop money-maxer.service
cd /home/ec2-user/mm/runs/live && rm -f month.db month.db-wal month.db-shm && cp start.db month.db
sudo systemctl start money-maxer.service && sleep 2 && systemctl is-active money-maxer.service
RESET
sudo chmod 755 /usr/local/bin/mm-reset
sudo systemctl daemon-reload && sudo systemctl enable caddy.service money-maxer.service >/dev/null 2>&1
sudo systemctl restart caddy.service
sudo systemctl restart money-maxer.service || echo "workspace not started: put DASHBOARD_PASSWORD (and ANTHROPIC_API_KEY) in /etc/money-maxer.env, then: sudo systemctl restart money-maxer.service"
sleep 5
echo "workspace: $(systemctl is-active money-maxer.service) · caddy: $(systemctl is-active caddy.service)"
for p in / /dashboard /api/overview; do curl -s -o /dev/null -w "on the box, no cookie: $p -> %{http_code}\n" "http://127.0.0.1:4320$p"; done
