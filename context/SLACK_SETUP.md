# Northwind Slack setup

Configured and verified 2026-09-19.

- Workspace: Northwind Systems — `T0C3620JPBK`
- Workspace URL: https://northwindsystems.slack.com/
- App: Northwind Finance Ops — `A0C37Q8RUSY`
- App settings: https://api.slack.com/apps/A0C37Q8RUSY
- Bot user ID: `U0C326E16BY`
- Bot ID: `B0C2XTW98V9`
- Existing all-northwind-systems channel: `C0C2Z6P4BPF` (bot membership not configured).

## Credentials

Both credentials are in the repository's ignored `.env`:

- `SLACK_BOT_TOKEN`: bot token, scopes `chat:write`, `im:write`.
- `SLACK_APP_TOKEN`: app-level token named `northwind-socket-mode`, scope `connections:write`.

Socket Mode and interactivity are enabled. No public callback URL or signing secret is required by the current Socket Mode transport. No event subscriptions or slash commands are configured because the current transport handles interactive buttons and modal submissions.

## Runtime

Load `.env` into the process and call `startSlack(db)` from `src/agents/slack/transport.ts`. The runtime must stay running to receive interactions. This setup does not start a persistent agent process.

For human approvals, the seeder must map each real Slack user's ID to the appropriate `approver.slack_user` record and authority limits. Do not use the bot user ID as a human approver. No approval authority was granted or changed during setup.

Verified `auth.test`, `apps.connections.open`, and an actual WebSocket `hello` handshake. No Slack messages were sent; a complete human approval round trip is not yet tested. The bot does not have permission to read channel or DM history.
