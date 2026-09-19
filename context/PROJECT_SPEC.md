# Footnote — final project spec, v2 (written Sat 19 Sep 2026, 5:05 PM ET)

**Track:** Maximor, "Agentic Systems for the Office of the CFO". Also entering Ramp, Token Company, OpenAI.
**Deadline:** submit on Plume by Sun 10:45 AM (hard stop 11:00). Plume project must exist by 11:59 PM tonight. Venue closed 1-7 AM.
**Status: proposed by Karan with a Claude Code session; needs team sign-off.** This takes the ambitious route the booth described and the track doc calls the stretch goal. Reasoning: [research/plan-reasoning.md](research/plan-reasoning.md). All research: [research/](research/).

---

## 1. What we are building

**The track asks: "How much of a finance team can an agentic system run?" Footnote answers with a number.**

Footnote is an agent finance team that closes a whole month for Northwind Systems ($60M SaaS, 12 customers, 10 vendors): it pays vendors, collects from customers, reconciles cash, recognizes revenue, books accruals, keeps the cash forecast alive, explains why the numbers moved, and audits itself. Eight functions, **one shared picture of the company, one judgment layer** used by all of them:

> investigate → propose an entry → a deterministic kernel re-checks its workpaper → post, or escalate to the person who knows → learn

Humans are pulled in only when an agent is blocked on context. Their answer is stored with its scope and end date, so it is asked once. Before running July live, the team **replays** Q2 (closed by humans) with the answers hidden, and **compiles** the humans' repeated judgment into policies a controller approves.

The output is the close itself, plus the answer to the track's question: for each function, how many decisions ran with no human, how many were escalated and why, and zero wrong entries posted unreviewed.

Pitch line: *"It all connects. One short-paid invoice touches the bank rec, the revenue schedule, the cash forecast, the close and the audit file. Watch it."*
Closing line: *"You asked how much of a finance team an agentic system can run. In July, this much."*

---

## 2. Why breadth is affordable: one layer, thin function packs

The CTO's first slide: "Finance is not one workflow. The same judgment layer spans many functions." So we build that layer once and add functions as packs. A pack is: seed data with planted exceptions, a few read tools, its decision kinds, a few kernel checks, and a prompt. No function gets its own agent framework.

| Shared, built once | Per function pack |
|---|---|
| As-of trace store and local double-entry ledger (SQLite) | Seed data and 2-4 planted exceptions |
| Tool layer, `propose_entry` runtime, kernel and workpapers | Read tools over its records |
| Investigator, escalation in Slack, facts and policies with scope | Decision kinds and extra kernel checks |
| Intent links, event bus for hand-offs, close conductor | Prompt and learned playbook |
| Replay, compile, autonomy ladder, console, QuickBooks mirror | |

**System of record for the run is the local ledger.** Accepted entries are mirrored one way into the real QuickBooks sandbox (native Invoice, Payment, CreditMemo and Bill where cheap; JournalEntry for everything else), with the workpaper and source email attached on the hero path. Gmail and Slack are live. This keeps eight functions independent of QuickBooks API quirks.

---

## 3. The eight functions (planted cases quote the track doc wherever possible)

| # | Function | Thin but real slice | Planted |
|---|---|---|---|
| 1 | **AR and collections** | Apply cash "when the payment doesn't say which"; resolve short-pays; chase aging with drafted emails | Initech short-pay with CEO side letter in Gmail · Wayne short-pay nothing explains (Slack) · parent pays for subsidiary |
| 2 | **AP** | Bills arrive by email; three-way match to PO and receipt; hold duplicates; route approvals; "decide what gets paid this week" against the forecast | duplicate bill · price above PO · bill with no receipt · "we changed bank details" email (refuse) |
| 3 | **Cash and bank rec** | Tie every bank line to the ledger exactly once; explain the rest | The doc's four, verbatim: one payment covering three invoices · a wire net of bank fees · a refund posted twice · a $12.40 difference nobody can explain |
| 4 | **Revenue** | Schedules computed in code from extracted contract terms; monthly recognition; concessions and upsells revise schedules | concession revises a schedule · mid-month upsell |
| 5 | **Close** | Checklist with dependencies across functions; accruals "for bills not yet received"; prepaid amortization; payroll accrual; "tie every balance-sheet account to evidence"; "track what's done and what's stuck"; lock the period | July cloud bill arrives 3 Aug (accrue) · annual software prepaid · one stuck item waiting on a human |
| 6 | **Forecast** | 13-week cash forecast "from receivables, payables and payroll", rebuilt as facts change; "when actuals land, explain the miss" | a customer pays two weeks late · learned concession lowers inflows through renewal |
| 7 | **Reporting** | Flux note per material variance, traced to the decisions and intents behind it; numbers tie to the ledger | the doc's example: gross margin down three points, traced to the transactions responsible |
| 8 | **Audit and controls** | Sample entries, re-run the kernel on their workpapers, test controls, write findings | The doc's four, verbatim: duplicate vendor · round-number payment · entry posted after the period closed · self-approved request |

Out of scope: equity, tax, FX, multi-entity, Stripe, HubSpot and Drive live, voice.

**Team roles, as the doc lists them:** preparer (the function agent) · reviewer (controller on GPT, a different model family) · approver (controller within its authority; a human in Slack above materiality or for anything new) · auditor (the audit agent at month end). Hand-offs go through the event bus: AR tells revenue and forecast; AP tells forecast and close; everything tells close; audit samples everything.

---

## 4. The demo spine: one event, every book

Initech pays $10,800 on a $12,000 invoice.
1. **Bank rec** sees a deposit that doesn't match. **AR** opens an intent: "Resolve the $1,200 shortfall on INV-1042".
2. The investigator checks the contract and CRM notes, then finds the CEO's email of 28 Jun: 10% off through renewal.
3. AR proposes a credit memo. The **kernel** checks the workpaper: footed, agreed to source (the quoted span is really in the email), approved by the controller, per policy. **The credit memo appears in QuickBooks with the workpaper and email attached.**
4. **Revenue** revises the schedule; July revenue drops $1,200. **Forecast** drops $1,200 a month through renewal. **Billing** lowers future invoices. **Reporting** writes the flux line. **Close** ticks "AR concessions reviewed". **Audit** samples the entry and re-performs it.
5. Click the intent: every artifact it created, in every function, with the same amounts. *The same transaction means the same thing everywhere.*

---

## 5. Learning, shown two ways

- **Replay then compile (past periods).** Q2 decision points for three kinds: short-pay treatment, wire-fee write-offs, AP account coding. Hide the humans' entries, decide, compare, flag human inconsistency. Compile repeated judgment into policies; backtest; approve; they run as code.
- **Repeated runs (corrections and feedback).** Run July. Collect human answers and controller corrections. Compile. Run July again from the same seed. Show questions asked, model calls, cost, and that the books still match.

Written policy also exists (a short accounting memo: materiality, approval matrix, accrual rules). Agents read it. Learned policy fills what it never said.

---

## 6. Frozen decisions

| Topic | Decision |
|---|---|
| Periods | History Apr-Jun 2026 (human-closed). Live: July close. August only if everything else is done. |
| Live systems | QuickBooks Online sandbox (mirror target), Gmail (evidence), Slack (humans). Bank feed is a file behind a tool unless Increase signup takes under 30 minutes. |
| Stack | TypeScript, one package, Node 22, pnpm. Claude Agent SDK (TS), in-process MCP tools. SQLite (better-sqlite3). Next.js console polling SQLite. zod. vitest. Integer cents everywhere. |
| Models | `claude-sonnet-5` default; `claude-haiku-4-5-20251001` for extraction; `claude-opus-5` for hard investigations; GPT for the controller. |
| Fallback | Agent SDK friction over 90 minutes: switch the loop to the Vercel AI SDK tool loop. Tools unchanged. |
| Agents may not | Post directly. Only `propose_entry` writes. No file or shell tools. Empty working directory. No exception-specific code in any agent. |
| Arithmetic | Schedules, forecast, matching, tie-outs and kernel checks are code. Models never add numbers. |

QuickBooks quirks already checked: a credit memo is applied with a zero-amount Payment linking both; attachments are a multipart upload with `AttachableRef.EntityRef`; `TxnDate` can be backdated; sandbox email cap 40 a day, so mail goes through Gmail.

---

## 7. Frozen schema (SQLite)

```sql
-- world and ledger
customer, vendor, contract, invoice, po, receipt, bill, bank_txn, payroll_run
period(id, status)                         -- open|closing|locked
gl_entry(id, period, date, source_decision_id, memo)   gl_line(entry_id, account, debit_cents, credit_cents, customer_id, vendor_id)
-- shared judgment layer
trace(id, source, kind, external_id, event_time, recorded_time, party_id, payload_json)
decision_point(id, function, period, kind, trace_ids_json, human_outcome_json, decided_at)
intent(id, parent_id, function, question, owner, status, end_condition_json, created_at, closed_at)
decision(id, intent_id, function, mode, decision_point_id, kind, proposal_json, actor,
         autonomy_level, model_calls, cost_micros, created_at)
workpaper(id, decision_id, marks_json, kernel_verdict, checkable_num, checkable_den)
artifact(id, decision_id, intent_id, function, system, external_id, kind, created_at, unwound_at)
fact(id, party_id, predicate, value_json, scope_json, valid_from, valid_to, learned_at,
     source_trace_ids_json, stated_by, approved_by, status)
policy(id, function, name, condition_json, action_json, intent_text, tier, backtest_json,
       status, approved_by, approved_at)
replay_result(decision_point_id, decision_id, agrees, diff_json, triage)
escalation(id, decision_id, asked_user, question_json, answer_json, asked_at, answered_at, slack_ts)
-- coordination
event(id, ts, topic, from_function, intent_id, payload_json)      -- hand-offs and console feed
checklist_item(id, period, function, name, depends_on_json, status, blocked_reason, decision_ids_json)
forecast_line(id, as_of, week, kind, source_ref, amount_cents, fact_id)
forecast_miss(id, week, expected_cents, actual_cents, decision_id)
```
`human_outcome_json` and the scoring key are never reachable from agent tools.

## 8. Frozen tool interface (same names in replay and live)

Shared read: `ledger.*` (open_invoices, get_invoice, party_history, trial_balance, account_activity) · `bank.*` (get_transaction, unmatched) · `mail.search`, `mail.get_thread` · `chat.search` · `contracts.get`, `contracts.find_clause` · `crm.owner`, `crm.notes` · `policy_memo.lookup` · `workbook.lookup` · `memory.facts`, `memory.policies`, `memory.similar_decisions`
Function read: `ap.bills`, `ap.po`, `ap.receipt`, `ap.vendor_history` · `rev.schedule` · `close.checklist` · `forecast.get` · `audit.sample`, `audit.rerun_kernel`, `audit.control_test` · `report.variance`
Write (all functions): `propose_entry(proposal)` · `escalate(question)` · `handoff(to_function, intent_id, note)` · `close.mark(item, status, reason)` · `record_fact_candidate(fact)` · `finish(summary)`

```ts
type Proposal = {
  intent_id: string; function: Fn;
  kind: 'apply_payment'|'credit_memo'|'write_off'|'customer_credit'|'dispute_hold'
      | 'approve_bill'|'hold_bill'|'schedule_payment'|'bank_adjustment'
      | 'rev_recognition'|'accrual'|'amortization'|'payroll_accrual'|'no_action';
  party_id: string;
  applications: { doc_id: string; amount_cents: number }[];
  entries: { account: string; debit_cents: number; credit_cents: number; memo: string }[];
  terms_change?: { pct_off?: number; until?: string };
  evidence: { claim: string; trace_id: string; quote?: string }[];
  policy_refs: string[]; fact_refs: string[];
  judgment: { note: string; confidence: 'high'|'medium'|'low' }[];
};
type Mark = { cls: 'F'|'E'|'P'|'J'; check: string; status: 'pass'|'fail'|'judgment'; detail: string; refs: string[] };
```

## 9. Kernel (pure code, vitest-covered)

- **F formal:** debits equal credits · applications fit the bank amount and each open balance · AR and AP subledgers equal their GL control accounts after posting · schedules sum to contract or prepaid value · every bank line matched exactly once · forecast opening cash equals GL cash
- **E evidence:** every `trace_id` exists (in replay, recorded by T) · every `quote` is a substring of its trace · party, amount and date tie across documents · three-way match within tolerance · every non-standard line has evidence
- **P process:** preparer is not approver · approval present when autonomy level or materiality ($500) requires it · approver authorized in the approval matrix · escalations answered before posting · period open (nothing posts after lock) · accruals flagged to reverse
- **J judgment:** each policy approved and its condition matches · each fact active on the date and in scope · anything left is recorded as `judgment` and needs reviewer sign-off

Accept only if no mark fails. Checkable fraction = machine-re-performed marks over all marks.
**Autonomy ladder per decision kind:** auto-post at 95% replay agreement with n of 5 or more and a covering policy or fact; post with review at 80%; otherwise shadow. Always show counts.

---

## 10. Three people, three lanes

| Lane | Owns |
|---|---|
| **Layer** | Tool layer, `propose_entry` runtime, kernel, agent loop and investigator, replay, compile, autonomy ladder |
| **World** | Seeder for all eight functions and Q2 history, local ledger, deterministic engines (matching, schedules, forecast, bank rec, tie-outs), scoring, close conductor and checklist |
| **Surface** | QuickBooks mirror, Gmail, Slack round trip, controller call, console (function board, intent ripple view, workpaper view, policy approval, scoreboard, tie-out sheet), demo video, README, slides |

## 11. Build order, checkpoints, cut order

| Time | Checkpoint |
|---|---|
| **18:00** | Plume project created. Intuit app and token. Repo up with schema, tool stubs, tiny fixture database. Overnight machine named. |
| **20:15** | Walking skeleton: seeded July, AR applies one clean payment through `propose_entry`, kernel accepts, local ledger and real QuickBooks both show it, console shows it. |
| **22:30** | **The spine works:** Initech end to end (function 1), then revenue schedule revised (4), forecast moves (6), close checklist ticks (5), intent ripple view shows all of it. |
| **00:45** | Bank rec with the doc's four cases (3). Slack escalation round trip (Wayne). AP pack (2). Pack up; venue closes 1 AM. |
| **03:00** | Audit pack (8) and flux notes (7). Replay and compile for three decision kinds. Full July run 1 started on the overnight machine. |
| **08:30** | Corrections compiled, July run 2 done. Scoreboard by function with real counts. Tie-out sheet green or honestly red. Feature freeze at 9:00. |
| **10:15** | Backup video, README (results with n, limitations, how to run), four slides. |
| **10:45** | Submitted on Plume: Maximor, Ramp, Token Company, OpenAI. |

**Order of function packs:** 1 AR → 4 revenue → 6 forecast → 5 close → 3 bank rec → 2 AP → 8 audit → 7 reporting.
**Cut from the bottom when behind:** payroll accrual · flux polish · AP payment-run choice · replay for AP coding · audit sampling depth · live Gmail (use the local mail store) · GPT controller (human approval in Slack instead).
**Never cut:** the spine in section 4 across at least five functions on one ledger · kernel with four-mark workpapers · one Slack escalation that becomes a fact · scoreboard by function with real counts.

## 12. Demo (5 minutes; real QuickBooks, Gmail, Slack and the console open)

1. **The question and the board.** Northwind's July close: eight functions, agents handing work to each other, one ledger.
2. **The spine** (section 4). End on the intent view: one transaction, every book.
3. **Humans only when blocked.** Wayne's shortfall goes to the judge's phone in Slack; the answer becomes a fact. AP holds a duplicate. Audit catches the self-approved bill.
4. **Learning.** Replay table, one policy pull request approved, July run 2 against run 1.
5. **Scoreboard by function** and the balance-sheet tie-out sheet. Edit a quoted span: the kernel rejects. Closing line.

## 13. Numbers we report (counts, with n, from real runs only)

Per function: decisions · compiled or rule-based · free inference · escalated · wrong entries posted unreviewed (target 0). Overall: share of July's decisions that ran with no human · checkable fraction · questions asked and repeat questions, run 1 vs run 2 · dollars and model calls per decision · balance-sheet accounts tied to evidence. State plainly that we built the company and its history. Commit run artifacts. Write a limitations section.

## 14. Prize notes and tonight's questions

- **OpenAI:** GPT is the independent controller; Codex writes the kernel's vitest suite, and we say so. **Token Company:** cost per decision, run 1 vs run 2, compiled hits at zero cost. **Ramp:** same demo.
- Ask Ajay: how do you prove an approval happened (process checks)? In replay, how do you reconstruct what the human knew? What do you do when humans were inconsistent?
