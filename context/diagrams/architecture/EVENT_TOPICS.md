# Canonical event topics (event.topic) — reviewer scan of all sheets in mmd/

Scanned 2026-09-19 ~19:20 ET by a reviewer across every `mmd/*.mmd`. **Applied 2026-09-19 ~19:25 ET:** all 17 replacement rows in section (b), plus `period.locked` → `close.period.locked` and `report.flux.reviewed` → `report.flux.cleared` on the sheets that were still being edited during the scan. These names are the diagram authors' inventions, not from the spec; treat this list as a proposal for the `event.topic` vocabulary.

Naming rule: `function.object.verb_past`. Where authors disagreed, the most common existing spelling wins; a tie goes to the spelling that fits the rule and names the emitting function. Topics with a single spelling are kept as written even where they are two-part (renaming them would be churn, not reconciliation).

## (a) Canonical list — 50 topics

Sheet numbers in brackets. "not drawn" = the sheet that should own this side does not show it yet.

| # | topic | emitted by | consumed by |
|---|---|---|---|
| 1 | `ingest.committed` | ingestion commit, stage 9 [01] | context graph [02] · drift monitor [01→03] |
| 2 | `ingest.refused` | ingestion structural validation and extraction guards [01] | console connector health [01] |
| 3 | `evidence.reversioned` | ingestion evidence versioning [01] | trigger intake → owning decision only [03] · judgment layer evidence-changed hook [04, not named there] · revenue [13] |
| 4 | `board.consent_ingested` | ingestion of the board consent file [18 EQ_TRACE; not drawn in 01] | equity-lite [18] |
| 5 | `crm.deal.closed_won` | NOT EMITTED on any sheet (expected: HubSpot connector [01] or drift comparator C1 [03]) | revenue [13] |
| 6 | `hr.departure_detected` | Slack intake of the HR departure notice [03, 18] | close payroll accrual [03] · equity-lite [18] · forecast [15] · audit control test [17] |
| 7 | `drift.explained` | drift monitor, known-fact suppression [03] | console drift board |
| 8 | `drift.logged_immaterial` | drift monitor triage [03] | scoreboard |
| 9 | `drift.updated` | drift monitor dedupe [03] | owner of the existing intent |
| 10 | `human.escalation.opened` | human loop, escalate(question) [05] | close conductor (checklist_item blocked) · console escalation queue [22] |
| 11 | `human.escalation.answered` | human loop, answer row written [05] | close conductor (unblock) · resuming intent [05] |
| 12 | `fact.activated` | memory layer on fact approval [drawn only in 10 AR_FACT_ACT; not drawn in 05] | AR parked intents [10] · revenue [13] · forecast [15] |
| 13 | `entry.posted` | shared Post step [04 J_POST; not named there] | audit JE screens [17] |
| 14 | `entry.blocked` | kernel hard-BLOCK rules and post gate [04] · AP duplicate block [12] | audit JE screens [17] |
| 15 | `ar.credit_memo.posted` | AR [10] via shared Post [04] | revenue [13] · forecast [15] · reporting · close tick [03] · audit [04] · demo spine [30] |
| 16 | `ar.payment.applied` | AR [10] | bank rec [11] · forecast [15] |
| 17 | `ar.dispute.opened` | AR [10] | forecast (haircut) |
| 18 | `ar.unapplied_cash` | AR [10] | close checklist |
| 19 | `ar.receivable.reopened` | AR [10] | forecast · bank rec |
| 20 | `ap.bill.approved` | AP [12] | forecast [15] · close [03, 14] |
| 21 | `ap.bill.held` | AP [12] | close (accrual candidate) · forecast |
| 22 | `ap.payment.scheduled` | AP payment run [12] | forecast [15] · bank rec (expects 1:n debits) [11] |
| 23 | `ap.vendor.change_requested` | AP, quarantined bank-detail change [12] | audit control test [17] |
| 24 | `bankrec.unmatched` | bank rec [11] (payload side = credit or debit) | AR cash application [10, 30] · AP [12] · equity-lite exercise cash [18] |
| 25 | `bankrec.reversal_detected` | bank rec [11] | AR reopen [10] |
| 26 | `bankrec.reconciled` | bank rec [11] | close tie-out [14] · forecast opening cash |
| 27 | `bankrec.stale` | bank rec, after an amended statement [11] | close (checklist_item blocked); consumer not drawn |
| 28 | `rev.schedule.revised` | revenue [13, 30] | forecast [15] · reporting [16] · close |
| 29 | `rev.recognised` | revenue [13] | close [14] |
| 30 | `rev.leakage.found` | revenue [13] | AR |
| 31 | `rev.invoice_issued` | NOT EMITTED on any sheet (expected: revenue / billing [13]) | AR [10] |
| 32 | `billing.expectation.changed` | revenue [13] | AR · forecast [15] |
| 33 | `close.accrual.posted` | close [14] | forecast [15] |
| 34 | `close.tb.final` | close [14] | reporting pre-lock flux review [16] |
| 35 | `close.period.locked` | close, lock gate [14] | every function and the kernel [03] · bank rec [11] · AP [12] · reporting [16] · audit final pass [17] |
| 36 | `close.out_of_period` | close [14] | reporting [16] · audit |
| 37 | `forecast.updated` | forecast [15] | reporting [16] · AP payment-run choice [12] |
| 38 | `forecast.miss.classified` | forecast [15] | reporting [16] · AR collections chase list |
| 39 | `forecast.min_cash.breach` | forecast [15] | no consumer drawn |
| 40 | `report.flux.cleared` | reporting [16] | close lock gate [14] |
| 41 | `report.flux.unexplained` | reporting [16] | close lock gate [14, 16] |
| 42 | `report.pack.published` | reporting [16] | no consumer drawn |
| 43 | `audit.finding.raised` | audit [17] | close [14] · owning function remediation intent [17] |
| 44 | `audit.pack.ready` | audit [17] | close checklist [17] |
| 45 | `audit.evidence.invalidated` | audit re-performance [17] | no consumer drawn (overlaps #3: decide whether audit should just re-emit `evidence.reversioned`) |
| 46 | `equity.forfeiture` | equity-lite [18] | close |
| 47 | `equity.expense_revised` | equity-lite [18] | close · reporting flux |
| 48 | `equity.exercise_expected` | equity-lite [18] | bank rec · forecast memo line |
| 49 | `equity.nso_exercise` | equity-lite [18] | payroll withholding touchpoint [18] |
| 50 | `equity.compliance_flag` | equity-lite [18] | audit [18] |


Gaps the list exposes (not spelling problems, so not in the table below):
- `14-close.mmd` consumes `payroll.*`, but no sheet defines any `payroll.` topic.
- `fact.activated`, `entry.posted` and `entry.blocked` are consumed by packs but the sheets that own the emitters (05 and 04) do not name them.
- `crm.deal.closed_won` and `rev.invoice_issued` have consumers and no emitter.

## (b) Replacement table — 17 rows, 20 string occurrences

Exact strings. Each `old string` was checked against the snapshot: the count column is the number of occurrences in that file, and all of them are to be replaced. Apply per file only (several old strings are substrings of canonical names in OTHER files, e.g. `period.locked` inside `close.period.locked`).

| file | old string | new string | n |
|---|---|---|---|
| 00-master.mmd | `hr.departure · period.locked` | `hr.departure_detected · close.period.locked` | 1 |
| 01-inputs-integrators.mmd | `event topic ingested` | `event topic ingest.committed` | 1 |
| 01-inputs-integrators.mmd | `event · topic ingested` | `event · topic ingest.committed` | 1 |
| 02-context-graph.mmd | `event topic ingested` | `event topic ingest.committed` | 1 |
| 03-drift-intents-coordination.mmd | `D_EV_T_DEPART["hr.departure<br/>` | `D_EV_T_DEPART["hr.departure_detected<br/>` | 1 |
| 03-drift-intents-coordination.mmd | `D_EV_T_LOCKED["period.locked<br/>` | `D_EV_T_LOCKED["close.period.locked<br/>` | 1 |
| 03-drift-intents-coordination.mmd | `"emits period.locked"` | `"emits close.period.locked"` | 1 |
| 04-judgment-layer.mmd | `event control.block.raised` | `event entry.blocked` | 1 |
| 12-ap.mmd | `ap.block.persisted` | `entry.blocked` | 2 |
| 12-ap.mmd | `forecast.cash_floor` | `forecast.updated` | 2 |
| 15-forecast.mmd | `ap.payment_run.scheduled` | `ap.payment.scheduled` | 1 |
| 17-audit-controls.mmd | `event period.locked (closing` | `event close.period.locked (closing` | 1 |
| 17-audit-controls.mmd | `<br/>at period.locked"]` | `<br/>at close.period.locked"]` | 1 |
| 17-audit-controls.mmd | `"finding.raised, pack.ready"` | `"audit.finding.raised, audit.pack.ready"` | 1 |
| 17-audit-controls.mmd | `each vendor.bank_changed has` | `each ap.vendor.change_requested has` | 1 |
| 18-equity-lite-payroll.mmd | `bank.deposit_unmatched` | `bankrec.unmatched` | 2 |
| 30-demo-spine.mmd | `event bank.deposit.unmatched` | `event bankrec.unmatched` | 1 |

Why each group resolved the way it did:
- **Period lock:** `close.period.locked` (6 uses: 11, 12, 14, 16) vs bare `period.locked` (6 uses: 00, 03, 17). Tie → the form that names the emitting function. Do NOT touch `period.locked_at` in sheet 17 (a proposed column, not a topic); the two sheet-17 strings above avoid it.
- **Departure:** `hr.departure_detected` (5) beats `hr.departure` (2).
- **Unmatched bank line:** `bankrec.unmatched` (5) beats `bank.deposit_unmatched` (2) and `bank.deposit.unmatched` (1); credit vs debit goes in the payload, as sheets 03 and 11 already draw it.
- **Payment run:** `ap.payment.scheduled` (4) beats `ap.payment_run.scheduled` (1).
- **BLOCK persisted:** three names for one event. `entry.blocked` chosen because the consumer (audit, sheet 17) already pairs it with `entry.posted`, and a BLOCK is raised by the kernel for any function, not only AP; `from_function` on the event row carries the function.
- **Ingestion commit:** the only undotted topic on the board; `ingest.committed` pairs with `ingest.refused`.

Two rows are judgment calls a human should confirm before applying:
1. `forecast.cash_floor` → `forecast.updated` (sheet 12). No sheet emits `forecast.cash_floor`; AP needs projected cash by week, which is the payload of `forecast.updated`. The alternative reading is `forecast.min_cash.breach`.
2. `vendor.bank_changed` → `ap.vendor.change_requested` (sheet 17). Assumes audit's operating test counts the quarantined change requests AP records, not some other vendor-master change event.
