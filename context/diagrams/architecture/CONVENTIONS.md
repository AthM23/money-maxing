# Architecture sheets — conventions

Follow these when editing or adding a sheet in `mmd/`, so every sheet still renders, still converts to Excalidraw, and still lines up with the others.

## Hard syntax rules (these are the things that break renders / Excalidraw import)
- First line: `flowchart TB` (or `LR` where stated in your assignment). No `graph`, no sequence/state/class diagrams.
- No front-matter, no `%%{init}%%` directive, no `click`, no `linkStyle`, no `:::` inline class shorthand — assign classes with `class A,B,C clsName` lines at the bottom.
- EVERY node label in double quotes: `ID["label"]`. Line breaks with `<br/>` only. No markdown, no backticks, no HTML other than `<br/>`.
- Inside labels do not use: double quotes, `#`, `{` `}`, `|`, `<` `>` (other than `<br/>`), `&` , or semicolons. Write "and", "gte", "lte", "vs". Parentheses and `$` and `%` and `:` and `/` and `·` and `→` are fine inside quoted labels.
- Edge labels: `A -- "text" --> B` (quoted). Dotted = `A -. "text" .-> B` for async / feedback / learning edges. Thick = `A == "text" ==> B` only for the main money path (the posting path).
- Node ids: UPPER_SNAKE, prefixed by your diagram's prefix (given in your assignment) so ids never collide when diagrams are merged: e.g. `AR_NORM`, `K_FORMAL`. Never use `end`, `class`, `graph`, `subgraph`, `style`, `default` as an id.
- Subgraph syntax: `subgraph AR_SG1["1 · Title"]` … `end`. Give every subgraph an id with your prefix. Use `direction LR` inside a subgraph only when it truly helps.
- Shapes: rectangle `["…"]` = step; `{{"…"}}` hexagon = deterministic gate/decision made in CODE; `(["…"])` stadium = a human; `[("…")]` cylinder = store/table; `[/"…"/]` parallelogram = external input or document; `(("…"))` circle only for the five route terminals.
- Keep each label at most 4 lines, each line at most ~48 characters. Dense but readable. Put real field names, algorithms, thresholds and case ids in labels — no vague boxes like "process data".
- Number the stages in subgraph titles (1 ·, 2 ·, …) in execution order.

## Colour classes — paste this block verbatim at the bottom of every file, then assign
```
classDef src fill:#e7eefc,stroke:#3b5bab,color:#0b1b40
classDef code fill:#e3f5e6,stroke:#2e7d46,color:#0c2e16
classDef model fill:#efe6fb,stroke:#6b3fb3,color:#25104a
classDef human fill:#fdebd3,stroke:#c0720f,color:#3f2503
classDef store fill:#fff6cf,stroke:#a88a06,color:#352c00
classDef gate fill:#ffffff,stroke:#b3261e,stroke-width:3px,color:#3b0906
classDef learn fill:#dbf3f3,stroke:#16787a,color:#062b2c
classDef ext fill:#f1f1f1,stroke:#666666,color:#1a1a1a
classDef rAuto fill:#2e7d46,stroke:#14401f,color:#ffffff
classDef rPropose fill:#2f62c9,stroke:#15306b,color:#ffffff
classDef rEscalate fill:#d9822b,stroke:#6e3d0c,color:#ffffff
classDef rRefuse fill:#6b6b6b,stroke:#2b2b2b,color:#ffffff
classDef rBlock fill:#b3261e,stroke:#5c0f0b,color:#ffffff
classDef stretch fill:#fafafa,stroke:#999999,stroke-dasharray:6 4,color:#444444
```
Meaning: `src` source system / inbound record · `code` deterministic code (arithmetic, matching, comparators, schedules) · `model` an LLM or ML model call · `human` a person · `store` a table or store · `gate` kernel check or hard rule · `learn` learning-loop component · `ext` outbound artifact in an external system · `rAuto/rPropose/rEscalate/rRefuse/rBlock` the five route terminals · `stretch` stretch / undecided / out-of-scope-for-24h (say which in the label).

## Shared vocabulary (use these exact names so diagrams line up)
- Stores (SQLite tables from spec §7): `trace`, `decision_point`, `intent`, `decision`, `workpaper`, `artifact`, `fact`, `policy`, `replay_result`, `escalation`, `event`, `checklist_item`, `forecast_line`, `forecast_miss`, `gl_entry`, `gl_line`, `period`, plus world tables `customer vendor contract invoice po receipt bill bank_txn payroll_run`.
- Shared judgment layer, in order: **Drift monitor** → **Intent** → **Agent router** (tier 0 compiled policy or fact, no model call → tier 1 small model `claude-haiku-4-5` or the fine-tuned small model → tier 2 `claude-sonnet-5` → tier 3 `claude-opus-5`; a kernel reject escalates one tier) → **Investigator** (read tools: ledger.*, bank.*, mail.search, chat.search, contracts.find_clause, crm.notes, policy_memo.lookup, workbook.lookup, memory.facts, memory.policies, memory.similar_decisions) → `propose_entry(Proposal)` + **Workpaper** with marks **F** formal · **E** evidence · **P** process · **J** judgment → **Kernel** (pure code) → accept → **Post** to local ledger → one-way **QuickBooks mirror**; material or new → **Controller agent (GPT, different model family)**; blocked on context → **Human in Slack** → answer → `fact` candidate with scope, valid_from/valid_to, learned_at, approved_by → applied automatically next time.
- Five routes (tests corpus): **AUTO** cleared unattended · **PROPOSE** human clicks approve, evidence attached · **ESCALATE** investigation done, decision handed over, names what it does not know · **REFUSE** declines to propose, lists everywhere it looked · **BLOCK** prevented even if a human approves, persisted with the rule name.
- Every function pack ends in the SAME shared exit: a node `XX_PROPOSE["propose_entry + workpaper"]` → node `XX_KERNEL{{"Kernel F·E·P·J + pack checks"}}` → the route terminals. Do not redraw the kernel internals in a pack diagram; show only the pack-specific extra checks.
- Hand-offs go over the **event bus** (`event` table): name the topic, e.g. `ar.credit_memo.posted`.
- Money is integer cents. Models never add numbers. Agents cannot post directly; only `propose_entry` writes.
- Status honesty: the repo has no code yet. This is a target architecture. Mark stretch items (`stretch` class): fine-tuned small model, equity-lite, processor-payout file (undecided scope), portal browser automation, GEPA batch run.

## After editing
Run `cd tools && npm install && node build.mjs`. It re-renders `svg/`, rebuilds `excalidraw/` (per sheet and the combined board) and fails loudly on a syntax error. Look at the SVG before committing: if edges turn to spaghetti, restructure subgraphs rather than adding more edges. Back-edges that wreck the layout are better written into a node label.

Node-id prefixes in use: `M_` master · `IN_` inputs · `CG_` context graph · `D_` drift and coordination · `J_` judgment layer · `H_` human loop · `AR_` · `BR_` · `AP_` · `RV_` · `CL_` · `FC_` · `RP_` · `AU_` · `EQ_` · `L_` learning · `FT_` fine-tune · `O_` observability · `TB_` testing · `S_` demo spine.
