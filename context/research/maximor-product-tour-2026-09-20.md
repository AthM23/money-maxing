# What Maximor's product looks like: their 2:42 tour, screen by screen (watched 20 Sep 2026, 01:15 ET)

Source: "Introducing Maximor: The Autonomous Finance Platform", their CEO's product tour, embedded on maximor.ai under
"See it running" (YouTube id `pNLfM2JKQ48`), plus the product mock-ups on the home page. Watched at a frame every two
seconds; key screens read at full resolution. Descriptions are ours. No frames are kept in the repository.

## The shape of their demo

One continuous story of money moving through a company, a caption naming each capability as its screen appears:
revenue from a closed deal (contract read, schedule and memo built, policy cited) → invoicing and collections →
**cash application and reconciliation** → a 13-week cash forecast → AP (bill coded, approval chased in Slack) → a close
that ticks its own checklist → consolidated, board-ready reporting → an ad-hoc question answered with a built report.
It opens with a loop drawn as four cards (self-learning, self-running, self-escalating, self-improving) and closes on
"running in production at private and public companies". The UI is on screen for roughly half the time; the rest is
the founder talking.

## Screens, and what each one is made of

| Their caption | What is on screen |
|---|---|
| ASC 606-Compliant Revenue Accounting | A table of deals: customer, opportunity, a status pill per row (*Needs Approval* / *Processed*), close date, amount |
| Audit-Ready Contract Analysis | A side panel of fields pulled from the contract. **Every AI-filled field carries a small sparkle icon; hovering shows an "AI Explanation" in one sentence and a "Source" chip naming the document** (e.g. the fees schedule of an order form). A bar at the bottom: **"Questions to review 0/1"** |
| Invoicing · AR Collections | The invoice record beside its PDF; a toast that a payment reminder was sent and when the next follow-up is due |
| **Cash Application & Reconciliation** | **One table, two halves. Left: the bank line (date, amount, memo). Right: the book lines that explain it, one row each (amount, an FX-rate column, memo, customer).** Their example is one deposit of 943.68 explained by four book lines, one of them in euro with the rate shown as "€→$ · 1.17" |
| Real-Time Cash Flow Forecasting | A 13-week line chart under the same table |
| AP: Coding, Approvals, Accruals | A bills table with totals on top; an "Accounting Details" grid per bill line (GL account, department, class, type, period), each coded field with the sparkle and an info icon; **a Slack card with Void / Approve** |
| Continuous Close | A progress ring (84%), pacing chart, progress by category and by status; then **the checklist itself**: tasks grouped by area, entity, preparer, status, due date, with comment and attachment counts, statuses flipping from *In progress* to *Completed* |
| Board-Ready Reporting | Operating expenses by department: a table and a bar chart |
| Ad-Hoc Answers & Dashboards | A chat panel: a typed request for AR ageing by customer, a "thinking" state, then a summary and a table |

Home page mock-ups add two more: a **"Close run · Q3 FY26"** card (accounts reconciled, transactions matched 100%,
entries drafted, flux explanations written, period locked, "Full audit trail attached") and **"Input needed" cards
addressed to a named person** ("FX revaluation on the €1.2M intercompany loan, no policy precedent. Your call." →
"Signed off · policy saved"). Their policy card reads "POLICY DERIVED · REV-REC-01 · Trigger: contract signed ·
Booked to: GL 4020", derived from "evidence left behind": prior journal entries, recon notes, sign-offs.

## Is there a trace or spend console?

**Not in anything public.** What a customer sees as "trace" is the audit trail: the explanation and source on each
field, questions to review, "full audit trail attached", "every action logged, reviewable and reversible". Model
traces and cost live in an engineering tool: **LangSmith** is on their subprocessor list
(`maximor-stack-2026-09-20.md`). Cost is, however, the second of the three open questions their CTO put to us in the
workshop (does agent cost fall with scale through policy reuse?). So a trace-and-cost view is not part of looking like
their product; it is how we answer him.

## What we already match, and what the screen has to show

| Theirs | Ours today | For the screen |
|---|---|---|
| Bank line ↔ book lines, FX-rate column | The main scene: one wire → cash, $40 fee, $1,960 FX, $2,200 held back (`pnpm state`: `receipts[].posted`, `workpaper.foreign_split`) | **Use their layout exactly**: the bank line on the left, our four book lines on the right with "€→$ · 1.0800", the fourth row marked *awaiting you* |
| Sparkle → AI explanation + source chip | Stronger: every entry carries quotes agreed to the source and tick marks the kernel re-performed | Same gesture: click a row → the explanation, **the quote highlighted inside the bank's advice**, and the checks that passed (F/E/P/J). Theirs names a source; ours proves it |
| "Input needed" → "Signed off · policy saved" | Escalation, answer with scope and end date, fact remembered; real Slack Approve | The queue, with the outcome line after answering: *remembered until 30 Sep, for Vossberg only* |
| POLICY DERIVED card | `SHORT-PAY-01 v1` with backtest (9 matched, 8 exact) and leave-one-out (6 of 8), v2 superseding v1 | Their card, plus the numbers they do not show |
| Close run checklist | Lane B's close checklist (7 of 11 on the Northwind world) | A "Close run · July" card with counts; keep it small |
| Ad-hoc chat, board reporting, forecast chart | Forecast exists in lane B; no chat, no board pack | Do not build. One line in the pitch |
| (not shown) | Kernel refusals, the auditor re-performing every entry, one changed digit failing it, earned autonomy per kind of entry, cost and trace per case, a fine-tuned local reader with a benchmark | **Our half of the demo.** A "Proof" area: trace and cost per case (code 15 ms and $0; the one question $1.07 once, then never again), run 1 against run 2, the audit re-run with the tamper |

## What to take from how they present

- Captions name the capability while the screen shows one concrete row. Ours should do the same: "Cash application",
  "Evidence", "Input needed", "Policy derived", "Audit".
- Light UI, white cards on a deep green field, lime accent, status pills, monospace for policy codes. Preet's landing
  page is already in that family.
- They never show a wall of data. Every screen is one table or one card.
- Their word is "platform", and their site says "not dashboards". Call ours the **workspace** or **close run**, not a
  dashboard.
