# Finance sandboxes and connectors (checked 19 Sep 2026)

What was confirmed from docs, what is from memory, and the quirks that would otherwise cost an hour each.

## QuickBooks Online sandbox — the real ledger
- Free Intuit developer account; a sandbox company with sample data is available immediately; several sandbox companies allowed (sources say 5 to 10); valid two years.
- 500 requests per minute per company. **Sandbox sends at most 40 emails a day**, so send customer mail through Gmail.
- No API keys: register an app for an OAuth 2.0 client id and secret; the OAuth playground is the quickest route to a first token. Sandbox base URL: `https://sandbox-quickbooks.api.intuit.com`.
- Entities we need: Customer, Vendor, Invoice, Payment, CreditMemo, Bill, BillPayment, JournalEntry, Deposit; reports for P&L, balance sheet, aged receivables. `TxnDate` can be set in the past, so history can be seeded. `PrivateNote` holds a memo.
- **Quirk: applying a credit memo to an invoice** is done by creating a **Payment (TotalAmt can be 0) whose lines link both the Invoice and the CreditMemo**. There is no direct "apply" call.
- **Attachments:** multipart upload; metadata carries `AttachableRef.EntityRef {type, value}` (type e.g. `Invoice`, `CreditMemo`).
- Sources: https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes · https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/sandbox-faqs · https://help.developer.intuit.com/s/question/0D54R00008YpnwWSAR/ · https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/attachable

## Bank feed — Increase sandbox (or a file)
- Confirmed: `POST /simulations/inbound_ach_transfers` with `amount` (cents), `company_name`, `company_entry_description`, `company_descriptive_date`, `company_discretionary_data`, `addenda.payment_related_information`. That is realistic thin remittance data.
- Docs say every API and dashboard feature is available in sandbox. **Not confirmed:** how fast signup is; an inbound wire simulation endpoint.
- Rule in the spec: if signup takes over 30 minutes, the bank feed is a file behind the same tool.
- Source: https://increase.com/documentation/api/inbound-ach-transfers

## Gmail
- An OAuth client already exists from an earlier project, with compose scope only. The investigator needs `gmail.readonly`. Seeding a backdated mailbox uses `users.messages.insert` with `internalDateSource=dateHeader`, which needs `gmail.insert` or `gmail.modify`: re-run consent. Fallback: send between two test accounts and accept today's dates. (From API knowledge, not re-verified today.)

## Slack
- Bot token and workspace exist. Interactive buttons need a public request URL (cloudflared or ngrok) and signature verification. Without a tunnel, fall back to a threaded reply that the bot polls.

## HubSpot (second wave)
- Developer test accounts are free, created in the HubSpot UI, and expire after 90 days without API calls. Token route (private app vs OAuth) not confirmed. Source: https://developers.hubspot.com/docs/getting-started/account-types

## Stripe test mode (out of scope for now)
- Bank-transfer reconciliation exists with automatic and manual modes; underpayments sit in the customer's cash balance; `payment_intents/{id}/apply_customer_balance` applies funds; test clocks simulate billing over time. Source: https://docs.stripe.com/payments/customer-balance/reconciliation

## Agent harness and memory (detail in frontier-stack.md)
- Claude Agent SDK (TypeScript `@anthropic-ai/claude-agent-sdk`): subagents, hooks, skills, in-process MCP tools, per-run cost. It spawns a CLI subprocess: Node runtime, not serverless or edge. Set `maxTurns` and a budget cap on every run.
- Memory: none of Graphiti, Mem0 or Letta has a "apply this precedent only within this scope" primitive, and Graphiti is Python-only. Decision: hand-rolled facts and policies in SQLite with Graphiti-style valid-time and learned-time columns.
- GEPA is real (`dspy.GEPA`) but wants dozens of labeled examples and a second strong model; wrong shape for corrections arriving one at a time. Named as an upgrade path, not built.
- Reference demo cited by the track doc: https://github.com/johnymontana/context-graph-demo (Claude Agent SDK + Neo4j + Next.js). It recommends and records decisions; it does not execute work in any system.
