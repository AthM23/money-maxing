# Roadmap — two builders, Sat 19:45 → Sun 10:45 ET

**Status: proposed 2026-09-19 ~19:35 ET, requested by AthM23. Not yet agreed by the team.**
`[PROJECT_SPEC.md](./PROJECT_SPEC.md)` §10-§11 planned three lanes with checkpoints starting at 18:15; those
times have passed and no code exists. This file re-cuts the same build for **two people** and the ~15 hours left.
Scope, schema, tool names and the never-cut list still come from the spec; sheet numbers refer to the
[architecture board](./diagrams/architecture/README.md). Decisions and changes of direction still go in
`[PROJECT_STATUS.md](./PROJECT_STATUS.md)`, not here.

Put names here when agreed: **Person A = ______ · Person B = Atharv (me)**

## The split in one line

> **A owns judgment. B owns the world.** A builds everything that decides, checks, remembers and learns.
> B builds everything that exists, arrives, gets computed and gets shown. They meet at one contract.


|                                                             | **Person A — Judgment and learning**                                                                                                                                                                                                                         | **Person B — World, engines and surface**                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns                                                        | Kernel and workpapers · `propose_entry` runtime · agent router and investigator · controller agent · Slack escalation → fact memory · replay, compile, autonomy ladder · eval harness and the 115-case corpus run · open-weight fine-tune · results write-up | Seeder and world file · connectors and ingestion · as-of trace store · local ledger · drift monitor · deterministic engines (matching, schedules, forecast, bank rec, tie-outs) · event bus and close conductor · QuickBooks mirror · console · demo video and slides |
| Sheets                                                      | 04 · 05 · 02 (facts and policies half) · 17 · 20 · 21 · 23                                                                                                                                                                                                   | 01 · 02 (entity and trace half) · 03 · 11 · 14 · 15 · 16 · 22 · 30                                                                                                                                                                                                    |
| Shared sheets                                               | 10 AR · 12 AP · 13 revenue: **B writes the engine, A writes the agent pack** (prompt, decision kinds, extra kernel checks)                                                                                                                                   | same                                                                                                                                                                                                                                                                  |
| Directories (proposed, so two people rarely touch one file) | `src/kernel/` `src/runtime/` `src/router/` `src/agents/` `src/memory/` `src/learn/` `eval/` `ft/`                                                                                                                                                            | `world/` `src/seed/` `src/connectors/` `src/ingest/` `src/ledger/` `src/drift/` `src/engines/` `src/bus/` `src/mirror/` `console/`                                                                                                                                    |
| Owns jointly                                                | `src/contract/` — schema SQL, `Proposal` and `Mark` types, tool-name registry, event topic constants. **Changed only with both people in the conversation.**                                                                                                 | same                                                                                                                                                                                                                                                                  |


Why this line: the spine needs both halves at every step, but the halves touch different files. The kernel, the
runtime and the agents never import a connector; the engines and the seeder never import a model client. The only
coupling is the contract, so that is the first thing built and the only thing edited together.

## Phase 0 · 19:45 → 20:30 · Together: freeze the contract

Pair on this. Nothing else starts until it is committed.

- [x] Repo scaffold per spec §6 (TypeScript, Node 22, pnpm, better-sqlite3, zod, vitest). Integer cents everywhere.
- [x] `src/contract/schema.sql` from spec §7, plus a yes/no on each addition the board found
  ```
  ([board README, "Schema gaps"](./diagrams/architecture/README.md#spec-corrections-found-while-drawing-this)).
  Minimum to take now, because retrofitting them is expensive: `party` + `alias`, `blocked_attempt`,
  `approval`, `posted_at` / `locked_at`, a third clock on `trace` (`ingested_at`), `reversal_mode` on accruals.
  ```
- [x] `Proposal`, `Mark`, tool names from spec §8, event topics from
  ```
  `[EVENT_TOPICS.md](./diagrams/architecture/EVENT_TOPICS.md)` as constants.
  ```
- [x] Decide and log in `PROJECT_STATUS.md` (each takes two minutes and blocks real code):
  ```
  1. Can anything above the $500 approval threshold ever be AUTO?
  2. Does the GPT controller's approval count as PROPOSE, or must a human click?
  3. Bank feed: Increase sandbox or file. (Board recommends file for Q2 history either way.)
  4. Stripe-style payout A-07 / H-2: in as a file, or out.
  ```
- [ ] Accounts, split now so nobody waits later — **A:** Anthropic and OpenAI keys, Slack app in **Socket Mode**
  ```
  (no tunnel needed), hosted fine-tune account (Together or Modal). **B:** Intuit developer app + sandbox
  token, Gmail re-consent with `gmail.readonly` + `gmail.insert`, HubSpot test account, **Plume project
  created (hard deadline 23:59 tonight)**.
  ```



## Phase 1 · 20:30 → 22:30 · Walking skeleton

**Meet at 22:30 on this:** one clean July payment goes bank line → drift → intent → agent → `propose_entry` →
kernel accepts → local ledger → shows in the console. No Initech yet. If it does not work by 22:30, stop adding
and fix it together.


| Person A                                                                                                                                                                                                               | Person B                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel as pure functions with vitest: F (debits = credits, applications fit, subledger = GL), E (trace exists, quote is a substring), P (period open, preparer ≠ approver), J (fact active and in scope). Sheet 04 §5. | `world/northwind.json` v0 from a seed: 12 customers, 10 vendors, July invoices and payments, **Initech and Wayne plants**, plus a thin Q2. Sheet 01 §1.              |
| `propose_entry` runtime: zod-validate → kernel → write `decision`, `workpaper`, `gl_entry` / `gl_line`. Only this function writes.                                                                                     | Local ledger + read tools behind spec §8 names: `ledger.open_invoices`, `ledger.get_invoice`, `bank.unmatched`, `bank.get_transaction`.                              |
| Agent loop on the Claude Agent SDK with in-process MCP tools (fallback after 90 min of friction: Vercel AI SDK loop, tools unchanged). Investigator reads B's tools. `maxTurns` and a dollar cap on every run.         | Ingestion to `trace` with idempotency on `source_system + source_id`, both dates, content hash. Local mail and chat stores first; live Gmail and Slack reads second. |
| Mutation test: edit a quoted span → kernel rejects. This is demo beat 5.                                                                                                                                               | First drift comparator: invoice vs cash received → opens an `intent`. Event bus table + `emit` / `subscribe`.                                                        |
|                                                                                                                                                                                                                        | Seed QuickBooks sandbox with customers and July invoices (`fn:` external ids, manifest, `--reset`).                                                                  |




## Phase 2 · 22:30 → 00:45 · The spine (never cut)

**Hard checkpoint 00:45, before the venue closes at 01:00:** Initech end to end across AR → revenue → forecast →
close on one ledger, visible in the ripple view (sheet 30). If it is not working, cut from the bottom of the
cut list below and spend the night on the spine, not on new packs.


| Person A                                                                                                                                                               | Person B                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AR agent pack (sheet 10): finds the CEO email, proposes the credit memo as **Dr deferred revenue / Cr AR**, evidence quote verified.                                   | Revenue schedule engine (sheet 13): ratable in cents, sums exactly to contract value, prospective revision with the **double-hit guard**.                                             |
| Fact memory (sheet 05): `fact` with scope, `valid_to`, `approved_by`, authority ceiling; applicability decided in code; router tier 0 hit on the next Initech invoice. | 13-week forecast engine (sheet 15): direct method, versioned `as_of`, drops $1,200 a month through renewal on `rev.schedule.revised`.                                                 |
| Controller agent on GPT as independent reviewer; disposition per the Phase 0 decision.                                                                                 | Close conductor (sheet 14): `checklist_item` DAG, ticks "AR concessions reviewed" from the event.                                                                                     |
| Slack escalation round trip for **Wayne** (Socket Mode): question with what was checked and 2-4 treatments → answer → scoped fact → dedupe so it is never asked twice. | QuickBooks mirror: CreditMemo applied via zero-amount Payment, workpaper + source email attached. Drift monitor treats HubSpot $144k vs $129.6k as explained once the fact is active. |
|                                                                                                                                                                        | Console v0 (Next.js polling SQLite): drift board, intent ripple view, workpaper with four tick marks.                                                                                 |




## Phase 3 · 01:00 → 07:00 · Overnight, off-site

Both people need sleep to demo at noon. Suggested: stagger it so someone is awake while the long jobs run —
**B sleeps ~01:30-05:00, A sleeps ~03:30-07:00.** Everything marked ⏱ runs unattended.


| Person A                                                                                                                                                                                                                       | Person B                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eval harness (sheet 23): load `tests/cases.csv`, score the **route**, five rubric numbers, **exit non-zero on any false auto-post**, baseline flag that disables the deterministic tier. Run the 22 min-fixture cases B seeds. | Bank rec pack (sheet 11): typed match groups, two-sided proof, the track doc's four cases (one payment / three invoices, wire net of fees, refund posted twice, the $12.40).                    |
| Replay + compile for **one** decision kind (short-pay treatment) on Q2: answers hidden, as-of guard, agreement with n, one policy proposed for approval. Second kind only if the first is done.                                | AP pack engine (sheet 12): three-way match, obligation-key duplicate block, changed-bank-details **BLOCK** that a Slack approval cannot lift. Seed the min-fixture cases twice where learnable. |
| ⏱ Export traces → JSONL → start the **open-weight LoRA fine-tune** on the hosted trainer; train the gradient-boosted pair-feature baseline on CPU (minutes). Sheet 21 §3-§5.                                                   | Balance-sheet tie-out sheet (cash, AR, AP, deferred revenue, accruals). Accrual for the cloud bill that arrives 3 Aug; prepaid amortisation.                                                    |
| ⏱ Kick off **full July run 1** on the overnight machine before sleeping.                                                                                                                                                       | ⏱ `pnpm seed --target=all --reset` verified from clean, so run 2 starts from the same seed.                                                                                                     |
| Stretch, only if the harness is green: overnight research loop (sheet 20 loop D) with kernel, scorer and labels read-only.                                                                                                     | Stretch: processor-payout file (if Phase 0 said in).                                                                                                                                            |




## Phase 4 · 07:00 → 09:00 · Learn, measure, freeze


| Person A                                                                                                                                                                                          | Person B                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Compile run 1's answers and corrections → **July run 2** from the same seed. Record questions asked, repeat questions (target 0), model calls, dollars, and that the books match.                 | Scoreboard by function from real counts (sheet 22 §3). Tie-out sheet green or honestly red.                                           |
| Fine-tuned model: evaluate vs base vs Claude on held-out entities, calibrate, run in **shadow only**. Report agreement rate and cost per decision; do not promote it into the posting path today. | Reporting: flux note for the July revenue drop, every numeral bound to the ledger snapshot (sheet 16). Trace timeline in the console. |
| Audit pack, minimal (sheet 17): sample entries, `audit.rerun_kernel`, the self-approved bill and the post-close entry. Auditor has no access to `memory.facts`.                                   | Demo dry run against the real QuickBooks, Gmail and Slack; fix what breaks.                                                           |


**Feature freeze 09:00.** After this, only fixes to things already on the demo path.

## Phase 5 · 09:00 → 10:45 · Ship


| Person A                                                                                                                                                                          | Person B                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `tests/RESULTS.md` run log with n, including the unflattering numbers. README sections: results, limitations, one-line repro command. Commit run artifacts.                       | Backup demo video. Four slides. README: what it is, how to run. |
| Both: rehearse the five-minute demo twice (spec §12), one person drives, the other answers. **Submit on Plume by 10:45** (hard stop 11:00): Maximor, Ramp, Token Company, OpenAI. | same                                                            |




## Sync points


| When  | What                                                     | Who decides if it slips                                                         |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 20:30 | Contract committed                                       | Both — nothing else starts without it                                           |
| 22:30 | Walking skeleton                                         | Both pair until it works                                                        |
| 23:30 | **Plume project exists**                                 | B                                                                               |
| 00:45 | Spine works                                              | Cut list applies; A calls kernel and memory cuts, B calls pack and surface cuts |
| 07:00 | Overnight jobs checked: run 1, fine-tune job, seed reset | Whoever is awake posts status in Slack                                          |
| 09:00 | Feature freeze                                           | Both                                                                            |
| 10:45 | Submitted                                                | B submits, A confirms                                                           |


Between sync points: push small commits to `main` often, pull before starting anything new, and never edit
`src/contract/` alone.

## Cut list (from the bottom up) and who drops what

Adapted from spec §11 for two people.


| Cut order | Item                                                                                                                                                                                                                                              | Owner |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1st       | Overnight research loop                                                                                                                                                                                                                           | A     |
| 2nd       | Equity-lite and payroll touchpoints (sheet 18)                                                                                                                                                                                                    | B     |
| 3rd       | Processor-payout file, portal automation                                                                                                                                                                                                          | B     |
| 4th       | Fine-tuned model in shadow → keep only the GBT baseline number; keep routing                                                                                                                                                                      | A     |
| 5th       | Reporting polish, board pack                                                                                                                                                                                                                      | B     |
| 6th       | AP payment-run selection; replay for a second decision kind                                                                                                                                                                                       | B / A |
| 7th       | Audit sampling depth (keep the two scripted findings)                                                                                                                                                                                             | A     |
| 8th       | Live Gmail → local mail store                                                                                                                                                                                                                     | B     |
| 9th       | GPT controller → human approval in Slack                                                                                                                                                                                                          | A     |
| **Never** | Spine across AR, revenue, forecast, close on one ledger · kernel with four-mark workpapers · one Slack escalation that becomes a fact and is not asked again · scoreboard by function with real counts · eval exits non-zero on a false auto-post | both  |




## Risks specific to a two-person split

- **B's lane is wider than A's.** It is also the more mechanical one. If B is behind at 22:30, A takes the
QuickBooks mirror; if behind at 00:45, A takes the AP engine overnight and drops the research loop.
- **Seeding real sandboxes eats hours.** The local stores behind the same tool names come first; live systems are
swapped in behind them. The demo needs QuickBooks and Slack live; Gmail and HubSpot can stay local if needed.
- **The fine-tune cannot be on the critical path.** It is started overnight, reported in shadow, and cut to the
CPU baseline without touching anything else.
- **Nothing here has been estimated against real velocity.** Re-cut at each sync point rather than defending the plan.

