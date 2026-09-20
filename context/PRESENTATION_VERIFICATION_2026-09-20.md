# Presentation verification — 2026-09-20

Tested from origin/main `455e18c` in isolated branch `codex/demo-e2e`. This is a local verification, not a deployment claim.

## What actually passed

- Baseline: 772 tests. After regression fixes and the new HTTP presentation test: **775 tests in 93 files passed**; TypeScript passed.
- Fresh local source stores were ingested through the connectors. Second ingest committed nothing (idempotent).
- Learned and approved the fee policy; code posted $105,800 cash, $40 fee and $1,960 FX on INV-3201, leaving $2,200 outstanding.
- A chat agent independently used the actual investigator tool caller to search mail, Slack, contracts, CRM, policy and ledger records. It read nine full traces and correctly escalated the unapproved $2,200 to Alex. It did not invent an approval or book the credit. This was requested as a substitute for unavailable local Claude/GX10 configuration; no Claude API usage or cost was measured.
- In the browser, answered with a standing 2% Vossberg credit through 2026-09-30, then approved the resulting entry. INV-3201 settled.
- Ran code again. INV-3202 reused the fact and prepared $550 without another question. Approved it in the browser; invoice settled. Its fee and FX were separately $25 and $245.
- The HTTP test verified other-customer and expired-date fact inapplicability, AR/GL equality, downstream records, and reruns without duplicate entries/questions.
- INV-3202 really revised the add-on revenue schedule v1 to v2: July $27,500 → $26,950; contract value $495,000 → $494,450. Forecast rebuilt, with no Vossberg horizon inflow change; CRM discrepancy was explained by the remembered fact.
- Browser audit: **16/16 entries clean, 0 findings**. Changed 1.0900 → 1.0909 in a disposable evidence copy: **5 findings**, including invalid quote/hash and FX check. Original evidence was unchanged (also asserted in the HTTP test).
- Fresh checker benchmark on 200 held-out remittances: oracle extraction **168 settled / 32 deductions open / 0 wrong**; deliberately corrupted extraction **200 refused / 0 wrong**. These are checker controls, not fresh fine-tuned model accuracy measurements.

## Defects fixed

1. Audit copy stayed open when no eligible posted evidence existed, preventing temporary-directory cleanup on Windows. Close it in `finally`; regression test added.
2. Close marked revenue revisions done merely because a modification row existed, even when a `memo_only` modification had no new schedule and explicitly needed human review. Keep that item in progress and dependent recognition blocked. Legitimate contra-revenue no-change treatment still passes; regression test added.
3. Substitute investigator trace heading was labelled Haiku based on tier alone. Use actual actor identity; explicitly identify chat verification and unmeasured API usage.
4. Flow diagram said a code-prepared entry posted without a person even when its approval was displayed beneath it. It now acknowledges approval and distinguishes pending approval from no remaining work.
5. Hosted snapshot lacked a visible read-only explanation. API exposes the mode; every page displays the limitation; overview mutation buttons are disabled.
6. 364/365 checked marks rounded up to 100%. Display a conservative one-decimal percentage instead.

## What to say and show to judges

Use the writable demo for answers/approvals. Start from an investigated, unanswered database and keep a reset copy.

Show INV-3201's source evidence and split, answer narrowly, approve, then INV-3202 reuse and schedule revision. End with the clean/tampered audit. The first invoice's revenue schedule did **not** revise automatically in this run: it needs review and should stay visibly open. Use the second invoice for the demonstrable revenue change.

Say “asked once within the stored scope, still subject to posting approval.” Current tested scope is customer, treatment, amount/rate and dates. Do not claim contract/incident-specific semantic matching from the free-text June-outage explanation.

The chat agent correctly escalated without proposing a bad draft. The new HTTP test explicitly submits a bad journal-bearing dispute hold and proves rejection. **Do not call that scripted negative test an organic model mistake.** To show an actual rejected model draft, use a separately captured genuine run and disclose its provenance.

The 200-remittance oracle and saboteur controls establish the checker boundary. Existing fine-tuned model artifacts are separate historical results; reader extraction, investigator reasoning and deterministic journal validation are separate stages.

## Remaining verification boundary

- Vercel was inspected in the browser: it still showed Vossberg open with no investigation, 14 code postings, 0 model API calls. It is a read-only snapshot, so deploying source alone does not create the investigated state or enable live approvals.
- These fixes have not been deployed to Vercel or the team's other machine.
- Live Gmail/Slack network ingestion, outgoing Slack identity/delivery and live QuickBooks writes were not freshly exercised in this pass. Their local connector/runtime tests passed. The chat investigator used ingested seeded source records, not fresh remote searches.
- No fresh Claude SDK or GX10 reader run was made, per the user's direction to substitute a chat agent. No fresh model-cost/latency claim is justified.
- The agent asked for “Alex” as supported by evidence. The local escalation accepted that name; actual Slack recipient mapping still requires verification on the live setup.
- Revenue's unsupported first-invoice adjustment remains a human-review item; there is no implemented dashboard action to finish that correction. It must not be represented as a fully closed month.

## Reproduce

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm test -- workspace/__tests__/presentation.test.ts
node node_modules/tsx/dist/cli.mjs src/demo/verifyChat.ts
```

`verifyChat.ts` creates a new isolated seeded world and a loopback-only bearer-protected bridge. A chat agent reads `runs/chat-verification-latest.json`, then GETs `/task`, POSTs `/tool` with `{name,input}`, and POSTs `/finish` with the tool-schema finish report. The exact domain tool calls are recorded by the normal runtime. Do not expose the bridge or its token publicly. The bridge closes when the investigation finishes.

This run's local artifacts are under `runs/chat-verification-1789897936085/`: database, before-investigation backup, task, investigation result, and oracle/saboteur benchmark outputs. Browser approval actions were performed against that database. Local preview is `http://localhost:4340/dashboard` while its server is running.
