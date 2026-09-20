# The demo path: four to five minutes, three beats

Written 20 Sep 2026, 03:30 EDT, after the whole path was run once in the workspace on a freshly built database
(`runs/demo`, built by `scripts/demo-build.sh` plus one paid Haiku pass). Every number below was read off that run.
This replaces sections 1 and 2 of `DEMO_RUNBOOK.md`, which drive the old console on :4317.

## Before you walk up (two minutes)

```bash
scripts/demo-serve.sh          # resets and serves: :4320 the prepared month, :4321 the same world from nothing
```

- Tab 1: `http://localhost:4320/dashboard` (the demo). Tab 2: `http://localhost:4321/dashboard` (from nothing).
  `http://localhost:4320/` is the marketing page; its nav has "Dashboard".
- Browser at 100% or 110%, window at least 1400 wide. Open the Vossberg case once so the page is warm.
- Run `scripts/demo-serve.sh` again after every rehearsal. It takes three seconds and calls no model.
- Nothing on this path needs the GX10, Slack, Gmail or QuickBooks. The Ask page needs the Anthropic key in `.env`.

## Beat 1. The track, solved (1:45)

| # | Where | Do | Say (the point, not a script) |
|---|---|---|---|
| 1 | Overview | nothing, just point | July for a company with three entities and four bank accounts at three banks. 12 customer payments came in. **Code alone posted 14 ledger entries for $0**, and the kernel re-performed every tick mark on them. Two things need me. |
| 2 | Cash → Vossberg Logistik | open the case | One wire, **$4,200 short for three reasons**. A matcher that sees one number calls it a short-pay. Here: $40 is the bank's fee, written off under a rule the system **learned from what the team booked last quarter** and a person approved like a pull request. $1,960 is the exchange rate moving; the kernel recomputes EUR 98,000 × (1.1000 − 1.0800) itself. Code did both. |
| 3 | same page, scroll to the trace | click a tool bubble | The last $2,200 is judgment. **Haiku, 98 seconds, 10 cents.** It read the policy memo, the contract, Slack, the customer's email. The kernel **refused its first draft**; the second is a hold, resting on six quotes, each matched character by character to its source. No model can post any other way. |
| 4 | same page, the red card | Decide it as *An agreed credit*, *standing*, until `2026-09-30`, rate `2`, one sentence in your words → **Decide** → **Approve** the credit memo that appears | I am the officer the contract says has to approve this. My words are kept as evidence, the answer is remembered with a scope and an end date, code prepares the entry, I approve it, the kernel checks it again at the post gate. |
| 5 | Overview | **Run the code tier** → open Input needed | A week later the same customer's add-on invoice is short the same way. **No model, no question**: code prepared the $550 credit from what I said once. It waits for one click because credit memos have not earned the right to post alone. |
| 6 | Close, the Audit card at the bottom | **Re-perform 2026-07**, then **…then change one digit in a source** | An auditor's pack re-performs every sampled entry independently: **15 of 15 clean**. Change one character in one bank advice (the rate, 1.0900 to 1.0909): **5 findings**. The evidence no longer hashes and the kernel disagrees. |

If you are short of time, drop step 6 to one sentence and keep 4 and 5: they are the track's "learns from people" in
thirty seconds.

## Beat 2. The model we trained (1:15)

Model page. Everything on it is read from result files in the repository, each with its n.

- **What:** Qwen3-4B-Instruct-2507, Apache-2.0 open weights. LoRA r=16, alpha=32 on every linear layer, bf16, 3 epochs,
  lr 1e-4 cosine, effective batch 16, max length 4,096. Trained and served on one ASUS GX10.
- **Data:** 956 train, 498 calibrate, 1,546 test documents, **split by month** (April–May, June, July). 18 customers and
  5 vendors appear in no training row; two document styles (OCR noise, a foreign layout) exist only in the test.
- **Result (strict-v2 scorer, n=120):** field-F1 **0.061 → 0.972**; valid against the schema 0% → 100%; whole document
  exactly right 0% → 70%; **0.977 on customers it never saw**; 0.964 on 614 documents generated after training.
- **Against a frontier API:** Haiku 4.5 with the same prompt: 0.106. Haiku with the whole schema pasted into every
  prompt: 0.962, and it edges exact match (74.2% against 70.0%). Say that; it is on the page.
- **The chart that matters, "Inside the harness":** the same 200 remittances through our real kernel and ledger.
  Untouched Qwen settles 0. A deliberately wrong reader settles 0 and **posts nothing wrong**, because the kernel
  refuses every reading. **Ours settles 168 and leaves 32 deductions for judgment, which is exactly what perfect
  labels reach.** Wrong postings: 0 in every row. The harness makes a bad model harmless and a good one useful.
- **Cost:** 50 documents a minute, 1.2 s each at batch 8, on a box we own. Frontier models are only paid for judgment.

Do not say the fine-tuned reader is on the demo path: the demo databases are built without it on purpose, so nothing
on screen depends on the GX10. It is wired (`pnpm worker --reader-url`), and measured by `pnpm bench:reader`.

## Beat 3. How it is built (1:00)

Agents page for the picture, then say five things:

1. **One write path.** `propose_entry` → a deterministic kernel → post, park for a person, or block. Four classes of
   tick mark: formal, evidence, process, judgment. An agent has no other way to touch the ledger.
2. **Cheapest first.** Code, then Haiku, Sonnet, Opus, each with a cost cap. This month: 14 entries by code for $0,
   one case by Haiku for $0.10.
3. **Memory with a scope and an end date.** A person's answer becomes a fact for that customer, that kind of entry,
   until a date. Another customer citing "the outage" gets nothing from it.
4. **It learns from the team.** Replay the closed quarter with the humans' entries hidden: 0 of 9 agree. Compile what
   people did into a rule, a person approves it: 8 of 9. Autonomy is earned per kind of entry, from evidence.
5. **It defends itself.** The audit pack cannot read the preparer's memory and cannot write. And the same books are
   an MCP server (`pnpm mcp`, ten read-only tools) and the Ask page: the model picks the tool, code computes the number.

## If they say "do it now, from nothing"

Tab 2 (`:4321`). All of this is free and instant:

1. **Learn from last quarter** → it drafts `SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150`.
2. Input needed → **Approve like a pull request** → replay agreement goes 0 of 9 → 8 of 9.
3. Overview → **Run the code tier** → 14 entries post, 342 of 342 tick marks, and the forecast, close checklist and
   revenue schedules are rebuilt in the same click.
4. The one paid step, in a terminal. **About 100 seconds and 10 cents; the tier caps sum to $2.25 if it climbs.**
   Start it, then do Beat 2 while it runs; the case page picks the trace up on its own (it polls every four seconds).

   ```bash
   env -u ANTHROPIC_API_KEY pnpm worker runs/demo/nothing.db --intent \
     "$(sqlite3 runs/demo/nothing.db "SELECT id FROM intent WHERE json_extract(case_json,'\$.bank_txn_id')='BTX-320'")"
   ```

   A model is not a script. On three real runs of this case it asked the account owner one question (Opus, $1.07),
   and held the amount as disputed (Haiku, $0.10). Both are right by the policy memo, and the workspace handles both:
   a question gets the answer form, a hold gets the decide form.

## If something goes wrong

| What | Do |
|---|---|
| A page looks stale | it polls every 4 s; otherwise reload. State lives in the database, not the page. |
| You clicked the wrong thing | `scripts/demo-serve.sh`, three seconds, reload. |
| Ask says there is no key | the server was started from a shell with the key exported as nothing. Start it with `scripts/demo-serve.sh`. |
| Wi-Fi is down | beats 1 to 3 need no network except the Ask page and the paid step. Skip both. |
| They ask what it cost to get here | tonight's honest number: one run of this case cost **$1.38 and settled nothing**, because our prompt told the models a hold credits AR. The kernel refused every draft, so the cost was $1.38 and **$0 was misposted**. After the fix: $0.10. That is the argument for the kernel. |

## Do not say

Things that are on the marketing page or in older notes and that the code does not back:

- "8 of 11 payments booked with zero AI calls." On this month it is **14 entries posted by code**; 3 of 12 receipts
  fully settled by code alone, the rest have a part that waits for a person.
- "A checker that cannot be fooled." Three reviews found ways past it on 19 Sep; all closed with tests. Say "re-performs
  every entry", and that zero false auto-posts is something we keep attacking, not something we proved.
- "Answered from Slack." One approval click ran live from Slack. The question form has not been answered live.
- "Replay agreement is CI." It is measured on every Learn; nothing in CI gates on it.
- AP, bank rec and reporting as agents. AP's three-way match is built and tested but no bills are seeded. Reporting is
  AR ageing, a trial balance and cash by week. Revenue, forecast and close are engines that react, not judgment packs.
- That the fine-tuned reader read the documents you just saw. It did not (see Beat 2).

## For Preet, on `frontend/index.html`, before submission

| Line | Says | Measured |
|---|---|---|
| 194 | "a checker that cannot be fooled" | "a checker that re-performs every entry" |
| 220, 266 | "8 payments booked by code", "8 of 11 … zero AI calls" | 14 entries posted by code, $0, on the demo month; one judgment case, Haiku, $0.10 |
| 266 | "compiled rules and a fine-tuned local model" clear routine work | compiled rules do; the reader is benchmarked (168 of 200, 0 wrong) but not on the demo path |
| 267 | "Wayne −$3,300 · answered from Slack" | the question form has not been answered live; one approval click has |
| 268 | "Replay agreement is CI" | measured on every Learn: 0 of 9 → 8 of 9 |
| 206–218 | the Initech / Wayne / Globex story | the demo is Vossberg and the global July |
| 305–307 | "$0.40 per 1M tokens" | the throughput is in `ft/data/fresh_exam_result.json`; the dollar figure's derivation is only in a commit message |
