# Plan reasoning (v4, order-to-cash framing)

> **Read this for the why, not the what.** The scope here is order-to-cash only. It was superseded at 6 PM on 19 Sep by [../PROJECT_SPEC.md](../PROJECT_SPEC.md), which keeps this mechanism and widens it to eight functions. Still current here: how Maximor's workshop slides and the CTO's three open questions map to what we build, the kernel and workpaper design, intent as state, risks, sandbox notes.

*Working name. **v4**, Sat 19 Sep 2026 ~5:15 PM ET: v3 plus the CTO's three open questions. Rebuilt around Maximor's own workshop, given by their CTO (Ajay, per Karan) (slide notes in [research/maximor-workshop-slides.md](maximor-workshop-slides.md)). Hacking ends Sun 11:00 AM.*

---

## 1. The pitch

**Maximor's workshop gave the recipe: reconstruct, replay, compile, verify. We built it for order-to-cash, on real systems.**

Northwind is a $60M SaaS company. Humans closed Q2. Nobody wrote the policy down, but the execution traces exist: QuickBooks history, the bank feed, Gmail, Slack, HubSpot notes, contracts, and the close workbook with reviewer comments. Footnote:

1. **Reconstructs** what the humans knew at each Q2 decision.
2. **Replays** Q2 with the answers hidden, and scores itself against what the humans actually booked.
3. **Compiles** repeated judgment into scoped policies and customer facts that a controller approves like a pull request. Approved ones become code, so next time there is no model call.
4. **Verifies** while it runs Q3 live on the real systems: every entry passes runtime checks and posts with its evidence attached, or it escalates to the person who knows, and the answer becomes a new trace.

Autonomy is earned per decision type, from replay agreement and review history.

One line: **"The source code doesn't exist. The execution traces do. We replay them before we run."**

### The three open questions he left on the screen, and our attempt at each

| His open question | Our attempt, in finance terms |
|---|---|
| **#1 What is Lean for finance?** "Finance has proofs too, but they are scattered across evidence, reconciliations, approvals, and policy." Formal · evidence · **process** · judgment checks. | **Every entry carries a workpaper a machine can re-perform.** Auditors already use four tick marks: footed, agreed to source, approved by, per policy. Those are his four checks. The agent searches for the proof; a tiny deterministic **kernel** re-checks it; nothing posts unless the kernel accepts. Judgment items stay marked as judgment, which is how it stays legible "without pretending it is clean math". Metric: the checkable fraction of each close. |
| **#2 Can agent costs compress with scale?** "Every deployment teaches policies, tests, tools, and abstractions that make the next deployment cheaper." Model routing · **policy reuse** · tool caches · compiled checks · escalation loops. | Cost per decision falls month over month as judgment is compiled. Policies carry a **portability tier**: accounting and controls (portable), SaaS vertical (portable), company-specific (not portable; customer facts never leave). Stretch: onboard a second company from the first one's policy library and measure tokens to reach the same replay agreement, with and without it. |
| **#3 Intent should be first-class state.** "Not just: here is the spreadsheet. Also: here is the question this spreadsheet was trying to answer." | Every case is an **intent**: the question being answered, its owner, its end condition. Entries, billing overrides, policies and workbook tabs link back to the intent that created them. When Acme's renewal arrives, billing asks which artifacts exist because of "honor the CEO's concession through renewal" and removes them. Replay reconstructs intent from reviewer comments and emails, not only outcomes. |

---

## 2. Their slides, our parts

| Their slide | Our part |
|---|---|
| "The source code doesn't exist. The execution traces do." Policy lives in the accounting memo, prior close files, reviewer comments, emails, ERP history. | An as-of trace store over all of those, plus the context graph |
| "Replay before you run. Hide the answer. Re-run the close." | Replay engine with no look-ahead; agreement scored against the humans' own entries |
| "Compile: repeated judgment → policy. Inference is expensive freedom… compile away as much freedom as possible." | Policy and fact compiler: scope, end date, backtest, controller approval; compiled into the cash matcher and billing |
| "What is pytest for finance?" | Their six checks, verbatim, run on every proposed entry |
| "0.95^80 ≈ 1.65%… restrict degrees of freedom, verify at runtime, escalate exceptions, learn from review." | A decision budget per close: how many decisions were compiled, how many were free inference, all verified, some escalated. Plus the autonomy ladder. |
| "One revenue contract… Auditor asks why? … leave a trail a human can trust." | Evidence attached inside the QuickBooks entry; auditor view |
| "Not a chatbot. Not a replacement ERP. A judgment and execution layer" over "contracts, spreadsheets, emails, ERPs". | Real sandboxes for all four source types, and agents that write back |
| Highlighted boxes: **Controls: can we prove it?** and **Judgment: materiality · policy · precedent** | Materiality thresholds, policy compiler, scoped precedent |

Other context that still holds: Foundation Capital led their seed and its context-graph essay names Maximor; the booth's CEO-discount story; both Syndicate cash winners were accounts-payable, no order-to-cash among the winners we catalogued; collections and disputes are their thinnest public module. The workshop was given by their CTO, who is on site. My research has his full name as Ajay Krishna Amudan: rebuilt Microsoft's internal finance platform, ICPC world finalist. Whether he judges is still unconfirmed, but his three open questions are the brief behind the brief.

---

## 3. Systems (connectors)

| System | Role | Sandbox status |
|---|---|---|
| **QuickBooks Online** | Ledger and AR: invoices, partial payments, credit memos, journal entries, AR aging, reports. Transaction dates can be set, so Q2 history can be seeded. | Free, sandbox company created immediately, 500 requests/min. Needs an OAuth 2.0 app. |
| **Bank: Increase sandbox** | Inbound ACH with originator name, entry description, addenda | `POST /simulations/inbound_ach_transfers` confirmed. Signup speed unconfirmed. Fallback: Plaid sandbox or a bank file drop. |
| **HubSpot test account** | Deals, owners, notes. Tells agents who to ask. | Free, created in the HubSpot UI. Token route to confirm. |
| **Gmail + Drive** | Side letters, customer AP threads, remittance advices, contracts | OAuth client exists. Reading needs `gmail.readonly`; backdated seeding via `messages.insert` needs `gmail.insert` or `gmail.modify`, so re-run consent. Fallback: send between two test accounts. |
| **Close workbook (Sheets or .xlsx in Drive)** | The humans' Q2 cash-application log and close checklist with reviewer comments. "Spreadsheets" is one of their four source types. | Trivial. |
| **Slack** | The humans: escalations, approvals, chatter that holds context | Already set up. |
| **Stripe test mode** (second wave) | Card customers: failed charges, chargebacks, payouts net of fees | Docs confirmed. |

Every connector is one tool interface with two backends: the real sandbox (live mode) and the as-of store (replay mode). If a signup or OAuth flow takes over 30 minutes, use a local stand-in and move on.

---

## 4. The four stages

### Reconstruct — "What did the human know?"
- Pull Q2 into a local as-of store (SQLite). Every record carries event time and recorded time.
- Decision points come from the ledger: each payment application, credit memo, write-off and AR or revenue journal entry in Q2 is one human decision with its outcome.
- A query at time T can only return what was recorded by T.

### Replay — "Hide the answer. Re-run the close."
- For each decision point, hide the human's entry and everything after it. The agent gets the same tools over the as-of store and proposes an entry with evidence.
- Compare with what the human booked: customer, invoices, amounts, accounts, who was asked.
- Output: agreement by decision type with n, and a triaged diff list: agent wrong · human inconsistent · context missing.
- No look-ahead by construction: the tool layer cannot see past T.

### Compile — "Repeated judgment → policy"
- Repeated consistent judgments become candidate policies. Customer-specific ones become facts with scope and end date.
- Backtest over all of Q2: n, correct, regressions. The controller approves it like a pull request.
- Approved items become code paths: the cash matcher for invoices already out, billing for invoices not yet issued. No model call next time.
- **Autonomy ladder per decision type:** shadow, post with review, auto-post. Set by replay agreement and review history.

### Verify — "Post, escalate, or learn" (Q3, live)
Every proposed entry carries a **workpaper**, and a small deterministic **kernel** re-checks it. The kernel is pure code over the entry, the workpaper and the stores; it trusts nothing the agent says. His six "pytest for finance" checks sort into his four classes:

| Tick mark | Checks | Who checks |
|---|---|---|
| **F · Formal** (footed) | Debits equal credits. Subledger reconciles to GL after posting. Revenue schedule sums to contract value. | Kernel |
| **E · Evidence** (agreed to source) | Every claim links a source: bank transaction id, invoice id, email message id with the quoted span, contract page and clause. The kernel confirms the source exists, the span is really in it, and customer, amount and date tie. | Kernel |
| **P · Process** (approved by) | Review path followed: preparer is not approver; the approver has authority for this type and amount per the approval matrix; the approval is a recorded, signed Slack event; escalation happened where policy requires it; autonomy level for this decision type respected. | Kernel |
| **J · Judgment** (per policy) | Which policy or precedent was applied; the applicability check (customer, scope, cap, dates) is code. Anything left over is written down and **marked as judgment**, with the reviewer's sign-off. | Kernel for applicability; human or reviewer for the remainder |

Kernel verdict: accept, or reject with the failed mark. Each workpaper reports its checkable fraction, for example "11 of 12 marks machine-re-performable, 1 judgment mark". An auditor can re-run the kernel on any entry later.

Accept: post to QuickBooks with the memo citing the workpaper, and the workpaper and email attached to the entry. Otherwise: Slack the owner from HubSpot with what was checked and the options. The answer is a new trace and goes back to Compile.

---

### Intent is first-class state
- `intent(id, question, owner, parent, status, end_condition)`. A case is an intent. "Close July AR" is the parent of "Resolve the $1,000 shortfall on INV-1042".
- `decision` links to its intent and its workpaper. `artifact(system, external_id)` links every QuickBooks entry, billing override, email sent, policy and workbook tab to the decision and intent that created it.
- Policies store the intent behind the humans' judgments ("don't chase customers for bank fees we can't control"), so an agent can reason from the reason when a case falls just outside the literal rule, and escalate with that context.
- End conditions drive cleanup: an expired intent lists the artifacts that must be unwound.

## 5. The team

| Agent | Job |
|---|---|
| **Billing** | Contract and deal to invoices; applies compiled terms; catches closed-won deals with no invoice |
| **Cash application** | Bank feed to invoices: lump payments, short-pays, payer aliases, unapplied cash |
| **Collections** | AR aging, dunning emails, replies, promises to pay, disputes |
| **Revenue accountant** | Schedules (computed in code from extracted terms), monthly entry, credit memos, deferred revenue rollforward |
| **Controller** | Reviews material entries, approves policies, signs off. Different model family (GPT). |
| **Auditor** (quarter end) | Samples, re-performs, asks why |

Shared: an investigator that searches Gmail, Slack, HubSpot, contracts and the workbook; the context graph. A period runner in code drives each month. Built on the Claude Agent SDK. No exception-specific code in any agent.

---

## 6. The seeded world

**Q2, closed by humans (the traces to replay):**
- Acme's 10% concession booked as a credit memo in April, May, June, memo "per CEO". The CEO's email exists.
- Wire shortfalls under $50 written off to bank charges five times, and once to misc expense. Humans are inconsistent; replay should flag it.
- "GLOBEX HOLDINGS LLC" payments applied to Globex Robotics.
- A one-time outage credit in May.
- Early-pay discounts accepted inside terms, rejected once when late.
- Reviewer comments in the close workbook explaining two of the above.

**Q3, live. Must-have six:**
1. A wire shortfall clears on the compiled policy, no model call.
2. Initech short-pays: a new CEO side letter nobody has booked. Investigate, find the email, credit memo, future invoices lower. (The booth story.)
3. A short-pay nothing explains: ask the account owner once in Slack; capture the answer with its scope.
4. Acme's renewal ended the discount and they still pay short: expired, refused, chased.
5. One ACH covers three invoices with an emailed remittance advice.
6. Never seen before: a foreign customer withholds 10% tax and emails a certificate. Shadow mode, precise question, learn.

Second wave: unbilled expansion (leakage), dispute over an undelivered workshop, duplicate payment, early-pay discount taken late, 90-day allowance, changed-bank-details email refused.

Accounting stays simple: invoices credit deferred revenue; monthly entry moves deferred to revenue; concessions to contra-revenue; bank fees to bank charges; unapplied cash stays a customer credit until instructed.

---

## 7. Measure of "better"

| Metric | Notes |
|---|---|
| **Replay agreement on Q2, by decision type** | Scored against the humans' own entries. Print n beside each. |
| **Decision budget per close** | Total decisions · compiled · free inference · escalated · verified. Put it next to their 0.95^80 line. |
| Wrong entries posted without review (target 0) | Safety headline |
| Questions asked; repeat questions | Repeats are memory failures |
| **Checkable fraction per close** | Share of tick marks the kernel can re-perform; judgment marks covered by compiled policy vs human-confirmed (open question #1) |
| Dollars and steps per decision, month over month | Open question #2, and the Token Company number. Break out model routing, tool-cache hits, compiled-policy hits. |
| Stretch: second company onboarded with and without the policy library | Tokens to reach the same replay agreement; how many policy templates transferred by tier; zero customer facts transferred |
| Month-end numbers vs expected books | Drift check |

Honesty rules: counts, not percentages; n on every number; we seeded the history, so say so, and let the judge write their own case in the demo; run harness resumable with per-case append; separate QuickBooks sandbox companies when comparing configurations; commit artifacts; write a limitations section.

---

## 8. Demo (5 minutes, real tabs open)

1. "You said replay before you run." The Q2 replay table: agreement by decision type. Open one diff: the human booked a wire fee to misc expense once; the agent flags the human.
2. **Compile.** Policy pull request: "wire shortfall ≤ $50 → 6150 Bank charges, 5 of 5 in Q2 backtest". Controller approves. The autonomy ladder moves that type to auto-post.
3. **Run July live.** A wire shortfall clears with no model call. Initech short-pays: the investigator finds the CEO's Gmail thread, **the kernel accepts the workpaper (F, E, P, J tick marks on screen), and a credit memo appears in QuickBooks with the workpaper and the email attached.** Break one mark on purpose (edit the quoted span): the kernel rejects.
4. An unexplained short-pay: **Slack message on the judge's phone.** They answer; it becomes a trace.
5. August: Acme's discount expired at renewal. **Refused.**
6. Scoreboard: the decision budget for the close next to 0.95^80; checkable fraction; cost per decision by month. If built: the second company onboarding cheaper from the policy library.
   Closing line: "You left three open questions on the screen. This is our attempt at each, running on real books."
7. **"Your turn."** The judge types a payment and the email that explains it, or doesn't. Same path as the seeder, worked live.

60-second version: beats 1, 2, 3.

---

## 9. Schedule and cut lines

| Block | When | What |
|---|---|---|
| B0 | now-17:45 | **Create the Plume project.** Fresh repo. **Signups and tokens first:** Intuit developer app and token, Increase, HubSpot. Freeze the tool interface and the schemas: trace, **intent**, decision, **workpaper**, artifact, fact, policy (with portability tier); commit a tiny fixture. Name the machine that stays powered 3-7 AM. |
| B1 | 17:45-19:30 | Lane A: seeder for Q2 history, into the as-of store first, then QuickBooks. Lane B: agent and investigator over the tool interface on the as-of store. Lane C: QuickBooks and bank connectors; the six checks. Lane D: console skeleton. **19:30 checkpoint: walking skeleton.** One clean payment applied in real QuickBooks by an agent, checked, shown. |
| B2 | 19:30-22:00 | **Milestone 1: replay works.** Q2 decision points detected, answers hidden, agreement table and diff view. In parallel, Lane C: the Initech short-pay live, credit memo with the email attached. |
| B3 | 22:00-00:30 | **Milestone 2: compile.** Candidate policies and facts, backtest, approval, compiled into matcher and billing, autonomy ladder. Slack escalation. Q3 seeds. |
| | 00:30-01:00 | Pack up. **Venue closed 1-7 AM.** |
| B4 | 01:00-03:00 | Full Q2 replay and Q3 live runs on the overnight machine. Then controller on GPT, revenue entry and rollforward. |
| | 03:00-07:00 | Sleep in shifts. |
| B5 | 07:00-09:00 | Fix what the runs exposed, rerun, scoreboard with real numbers. Judge-case form. |
| B6 | 09:00-10:15 | Demo runbook, backup video, README with evidence and limitations, four slides that quote their slides. |
| | 10:15-10:45 | Submit on Plume (deadline 11:00). |

Lanes: **A** seeding, as-of store, scoring · **B** agents, replay, compile · **C** connectors and checks · **D** console and demo.

**Cut line:** replay, compile, the kernel with four-mark workpapers, intent links, the live Initech case and B6 are the submission. Replay runs on the local store, so it never waits on a connector. Then, in order: Slack escalation, expiry refusal driven by the intent's end condition, cost-per-decision chart, second company from the policy library, controller on GPT, lump payment, revenue rollforward, withholding-tax case, second wave, Stripe, voice.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| OAuth or signup eats the evening | First thing; 30-minute limit; stand-in behind the same tool. Replay needs no connector. |
| Looks like we parroted their talk | We build his mechanism and then attempt his three open questions, which he said are unsolved: the re-performable workpaper and kernel, portability tiers for policy reuse, intent with end conditions. Plus what the slides don't say: no-look-ahead replay, flagging inconsistent humans, the autonomy ladder, a judge-authored case. Ask the booth how they reconstruct what a human knew. |
| Accounting mistakes in front of finance people | Standard treatments only; arithmetic in code; ask the booth to check the chart of accounts tonight |
| Numbers look staged | Counts with n; seeded history stated plainly; judge-authored case; committed artifacts; limitations section |
| "Hard-coded workflow" | No exception-specific agent code; the never-seen case; the judge's case |
| Live demo breaks | Stand-in backends, a recorded run in the console, backup video |
| QuickBooks sandbox caps (40 emails/day) | Customer email goes through Gmail |

---

## 11. Prizes this stacks with

- **Maximor** $4k / $2k / $1k, top five fast-tracked. Primary.
- **Ramp** "Save Time. Save Money." Same demo.
- **Token Company** $500. "Inference is expensive freedom": cost per exception before and after compile.
- **OpenAI**. GPT as the independent controller, plus one concrete thing Codex built.
- **Deepgram** (stretch). A human answers an escalation by voice.
- Not Visa. Enter HackMIT without a theme track.

---

## 12. Questions for the Maximor booth tonight

1. In replay, how do you reconstruct what the human knew at the time: system timestamps, or do you interview people?
2. What do you do when the humans were inconsistent with each other?
3. Is our chart of accounts and concession treatment what you'd expect for a SaaS company this size?

---

## Sources
- Workshop slides: [research/maximor-workshop-slides.md](maximor-workshop-slides.md). Company research: [research/maximor-intel.md](maximor-company-intel.md). Stack: [research/frontier-stack.md](frontier-stack.md).
- QuickBooks sandbox: [Intuit docs](https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes), [FAQ](https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/sandbox-faqs). Increase: [inbound ACH simulation](https://increase.com/documentation/api/inbound-ach-transfers). Stripe: [reconciliation](https://docs.stripe.com/payments/customer-balance/reconciliation). HubSpot: [account types](https://developers.hubspot.com/docs/getting-started/account-types).
- AccountingBench: [Gigazine summary](https://gigazine.net/gsc_news/en/20250724-accountingbench/). Context graphs: [Foundation Capital essay](https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity), [reference demo](https://github.com/johnymontana/context-graph-demo).
