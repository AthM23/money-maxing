# Footnote — architecture board

**Status: target architecture, proposed 2026-09-19. No code exists yet and nothing here has been run or measured.**
It elaborates [`../../PROJECT_SPEC.md`](../../PROJECT_SPEC.md) (v3); where research contradicted the spec, the
sheet follows the research and the difference is listed under [Spec corrections](#spec-corrections-found-while-drawing-this).
Decisions still belong in [`../../PROJECT_STATUS.md`](../../PROJECT_STATUS.md).

Twenty sheets: 1,931 nodes, 2,586 edges, 245 subgraphs. Every box names a real thing: a table, a tool, a field, an algorithm and its
bound, a kernel check, an event topic, or a test-corpus case id from [`../../../tests/`](../../../tests/README.md).

## How to open and edit it

| You want to… | Use |
|---|---|
| Edit on a whiteboard | [`excalidraw/footnote-architecture-board.excalidraw`](excalidraw/footnote-architecture-board.excalidraw) — all sheets on one canvas. Open it at [excalidraw.com](https://excalidraw.com) (menu → Open) or with the VS Code Excalidraw extension. Shapes keep their colours, labels are bound to their boxes, arrows are bound to their nodes so they follow when you drag. One file per sheet sits beside it. |
| Edit as text | [`mmd/*.mmd`](mmd/) — Mermaid flowcharts. Paste into [mermaid.live](https://mermaid.live), or preview in VS Code / GitHub. These are the source of truth; the other formats are generated from them. |
| Just read it | Pan-and-zoom viewer: https://claude.ai/artifact/QYYQ4xxUXfzwHLUVeTkMCa (private to its owner until shared from the page's Share menu). Or open any [`svg/*.svg`](svg/) in a browser. `node tools/gen_viewer.mjs svg tools/viewer.html` builds the same viewer locally. |
| Regenerate after editing `.mmd` | `cd tools && npm install && node build.mjs` — re-renders every SVG and rebuilds every Excalidraw file. Note this overwrites hand edits made in Excalidraw, so pick one editing surface per sheet. |

Conventions every sheet follows (colour classes, node-id prefixes, label rules that keep the Excalidraw
conversion working) are in [`CONVENTIONS.md`](CONVENTIONS.md).

## Legend

| Colour | Meaning |
|---|---|
| blue | source system or inbound record |
| green | deterministic code — arithmetic, matching, comparators, schedules. Models never add numbers |
| purple | a model call (LLM or the fine-tuned small model) |
| orange | a person |
| yellow | a store or table |
| white, thick red border | kernel check or hard gate decided in code |
| teal | learning, training, testing |
| grey | outbound artifact in an external system |
| dashed grey | stretch, undecided, or out of scope for the 24 hours |
| route circles | AUTO green · PROPOSE blue · ESCALATE orange · REFUSE grey · BLOCK red |

## The sheets

| # | Sheet | What it covers |
|---|---|---|
| 00 | [Master map](mmd/00-master.mmd) | The whole system on one sheet, with pointers to every detailed sheet |
| 01 | [Inputs and integrators](mmd/01-inputs-integrators.mmd) | Seeded world, one lane per connector, validate-before-content, canonicalise, extract, entity resolution, as-of trace store, evidence versioning |
| 02 | [Context graph and memory](mmd/02-context-graph.mmd) | Entity layer, decision-trace layer, the judge's three context tiers, fact and policy anatomy and lifecycle, retrieval order, the audit fence |
| 03 | [Drift monitor, intents, coordination](mmd/03-drift-intents-coordination.mmd) | Nine comparators, difference triage, fact suppression, intent as first-class state, event bus, close conductor |
| 04 | [Judgment layer and kernel](mmd/04-judgment-layer.mmd) | Router tiers, investigator, proposal and workpaper, every F / E / P / J check, hard BLOCK rules, autonomy ladder, post and ripple |
| 05 | [Human loop: asked once](mmd/05-human-loop-memory.mmd) | When to escalate, the question, Slack round trip, answer → fact or policy with guards, automatic re-use, decay |
| 10 | [AR, cash application, collections](mmd/10-ar-collections.mmd) | Function pack |
| 11 | [Cash and bank reconciliation](mmd/11-bank-rec.mmd) | Function pack |
| 12 | [Accounts payable](mmd/12-ap.mmd) | Function pack |
| 13 | [Revenue](mmd/13-revenue.mmd) | Function pack |
| 14 | [Month-end close](mmd/14-close.mmd) | Function pack and close conductor |
| 15 | [13-week cash forecast](mmd/15-forecast.mmd) | Function pack (produces artifacts, not journals) |
| 16 | [Reporting and flux](mmd/16-reporting.mmd) | Function pack (produces artifacts, not journals) |
| 17 | [Audit and controls](mmd/17-audit-controls.mmd) | Function pack, fenced off from preparer memory |
| 18 | [Equity-lite and payroll touchpoints](mmd/18-equity-lite-payroll.mmd) | Stretch pack. Not tax or legal advice |
| 20 | [Learning loops](mmd/20-learning-loops.mmd) | Replay, compile, online corrections, overnight research loop (proposed), CI, autonomy ladder |
| 21 | [Open-weight fine-tune pipeline](mmd/21-finetune-pipeline.mmd) | Label sources, task heads, splits, LoRA training, calibration, shadow, promotion, monitoring |
| 22 | [Observability and eval](mmd/22-observability-eval.mmd) | Decision traces, console, scoreboard, tie-out, corpus harness, reproducibility |
| 23 | [Testing and benchmarking](mmd/23-testing-benchmarking.mmd) | Test pyramid, reliability, ablations, the sponsor's reference benchmarks, our measure of better, CI gates |
| 30 | [Demo spine](mmd/30-demo-spine.mmd) | Initech short-pay through every book, then the Wayne escalation that is asked once |

Every function-pack sheet has the same skeleton so they can be compared: inputs and triggers → normalise →
compare / compute in code (ordered passes with bounds) → where a model is used → shared exit
(`propose_entry` + workpaper → kernel with the pack's extra checks → five route terminals) → an output-cases
block (outcome → route → entry with Dr/Cr → who is notified, with corpus case ids) → events, what is learnable
and what must never be learned, scoreboard metrics.

## How it was made and checked

Seven research passes (web, primary sources where they would load) wrote the briefs below. Eighteen authors drew
one sheet each from the spec, the corpus and a brief, and each had to render its sheet and look at it. The master
map was drawn by hand. Four independent reviewers then audited every sheet against the corpus routes in
`tests/cases.csv`, the briefs and the spec, and fixed about 190 issues in place. The ones that mattered: a wire-fee
entry crediting AR instead of cash, a payment release that bypassed the kernel, an AUTO path that skipped the post
gate, a research loop able to write its own regression labels, a cash-flow statement that did not foot, a
memory-to-auditor read path, a wrong precedence rule between context tiers, and a dozen corpus cases drawn under
the wrong route. Event topic names were then normalised to one list of 50 ([`EVENT_TOPICS.md`](EVENT_TOPICS.md)).
Every sheet re-renders from a clean `npm install`, and every arrow on the Excalidraw board is bound to its nodes.

What was **not** checked: nobody has implemented any of this, so no claim on any sheet is a measured result.
Items the research could not confirm are labelled UNVERIFIED on the sheet.

## Research behind it

Seven briefs, each with sources and with unconfirmed items marked UNVERIFIED, in
[`../../research/architecture-briefs/`](../../research/architecture-briefs/):
`ingestion-context-graph` · `ar-bankrec-ap` · `revenue-close-forecast-reporting` · `audit-equity-payroll` ·
`self-improvement` · `fine-tuning` · `testing-benchmarking`.

## Spec corrections found while drawing this

Each of these is drawn on the sheets and needs a decision before the schema freezes. None has been applied to
`PROJECT_SPEC.md`.

**Accounting**
1. *Initech concession can hit revenue twice.* A price-only concession on the remaining SaaS term is a prospective
   modification: the credit memo debits deferred revenue (contract liability); only the schedule revision moves
   revenue. Sheets 13 and 30 draw a double-hit guard. The QuickBooks credit-memo item must map to that account.
2. *Bank rec kernel check is wrong as written.* "Every bank line matched exactly once" becomes typed match groups
   over bank **and** ledger lines plus a two-sided proof. Timing items (A-01, A-02) are reconciling items, not
   journal entries. Tolerance applies to 1:1 matches only, never combined with subset-sum. Uniqueness, not
   existence, is what gates AUTO and PROPOSE.
3. *Changed bank details (B-17) is BLOCK, not refuse,* and a Slack approval does not lift it; only an out-of-band
   verification recorded by a second person does.
4. *Duplicates need an obligation key* `(vendor, PO line or service period, amount)` — this is what lets B-14
   escalate at bill stage while H-1 blocks at payment stage.
5. *One $500 threshold should be three:* approval threshold, a dual dollar-and-percent flux threshold, and a
   SAB 99-style assessment with qualitative overrides for out-of-period items (D-09 vs D-10).
6. *Accruals need a `reversal_mode`;* "flagged to reverse" would break the accumulating $30k accrual plant.
7. *Flux review should run before lock and gate it.* Reopening a period stays human-only.
8. *Equity-lite:* the 409A 12-month window is a rebuttable presumption that also fails on a material event; the
   Rule 701 check must run before each grant and the spec omits the (d)(2) cap; a compliance failure escalates but
   never blocks expense recognition.
9. *Audit sampling:* risk-based selections cannot be projected to the population (AS 2315); a Benford screen is
   not meaningful with 10 vendors.

**Schema gaps** (drawn as "proposed schema addition" nodes)
party and alias master · evidence versioning with content hash and downstream invalidation · a third clock on
`trace` (the seeder manifest must supply the world's `recorded_time`, separate from `ingested_at`, or
no-look-ahead replay breaks because everything is seeded on 19 Sep) · approval record, `posted_at`, `locked_at` ·
`blocked_attempt` · employee and grant tables · authority ceiling and `explained_amount` on `fact` (a fact
suppresses only the amount it explains) · artifact kinds in `Proposal.kind` for forecast and reporting, with a
kernel check that rejects any numeral not bound to a ledger snapshot · per-step trace table.

**Connectors**
Slack Socket Mode delivers button clicks over a WebSocket, so no tunnel or public URL is needed
(`research/sandboxes-and-connectors.md` says otherwise). QuickBooks webhooks carry ids only, so poll Change Data
Capture and skip the mirror's own writes on ingest (Intuit's own pages would not load; marked UNVERIFIED). The
Increase wire simulation is confirmed; backdating is unlikely there, so Q2 bank history comes from the file feed.

**Auditor independence**
The spec gives every function shared read access to `memory.*`. The auditor has to be fenced off from preparer
memory and may never suppress a screen.

**Fine-tuning route**
Spec §6 names OpenAI fine-tuning as the lowest-friction route. OpenAI's deprecations page says organisations that
had never fine-tuned were blocked from creating jobs on 2026-05-07 (checked directly, 2026-09-19). The team has
said fine-tuning will use an open-weight model; sheet 21 draws LoRA SFT on a small open-weight model with Claude
as teacher and the kernel as the rejection-sampling filter, a gradient-boosted pair-feature baseline it must beat,
calibration with abstention, and shadow-before-promote. Route classification (AUTO / PROPOSE / …) is deliberately
not learned.

## Decisions the review left for the team

1. **Can anything above the $500 approval threshold ever be AUTO?** Sheets draw the Initech $1,200 credit memo as
   PROPOSE with a human approver. On July run 2, does the approver ceiling stored on a fact satisfy the approval
   rule, or does the Wayne entry still route PROPOSE?
2. **Does the GPT controller's approval count as PROPOSE?** The corpus defines PROPOSE as a human clicking approve.
3. **Which model family runs the auditor?** It has to differ from the preparer and from the GPT controller.
4. **Schema additions** (list above) — in or out before the schema freezes.
5. **Stripe-style payout (A-07 / H-2)** is still undecided scope; it is drawn dashed.
6. **Fine-tune priority.** The team has said fine-tuning uses an open-weight model; spec §11 still lists the
   fine-tuned model as the first thing cut. Sheet 21 is titled as a stretch item for that reason.

## Assumptions the authors had to make

Where the spec is silent the sheets pick something and say so. The ones worth a decision:
event topic names are the authors' inventions, normalised in `EVENT_TOPICS.md`, not from the spec · GL account names on the Dr/Cr labels · the "already asked" dedupe key is
party + predicate + decision kind, with no period · default when nobody answers an escalation is a dispute hold,
never a write-off · the kernel runs twice, on the proposal and again as a post gate with the approver's identity,
which is how a BLOCK can fire after a human approves · bank vs ledger cash tolerance is 0 cents, so the $12.40
always opens an intent · pass^k uses k = 5 seeds · one multi-task LoRA adapter, promoted per task and scope ·
the auditor's model is undecided (must differ from the preparer and from the GPT controller) · budget caps,
extraction-confidence floor, minimum-cash floor and flux bands are drawn as configuration with no value.
