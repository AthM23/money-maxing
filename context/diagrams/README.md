# Diagrams

Two different things live here. Check which one you are looking at before you quote it.

## Built — what the code actually does

**One sheet:** [`current-architecture.mmd`](./current-architecture.mmd) ·
[`.svg`](./current-architecture.svg) · [`.png`](./current-architecture.png)

Stages 0 to 10 run left to right and are the system: connectors → as-of trace store →
drift monitor → intent → the fine-tuned reader → the four-tier router → `propose_entry`
→ the kernel (F·E·P·J plus the hard blocks) → the five routes → controller → post gate →
ledger → mirror → event bus → engines, with the human loop, memory, the learning loop,
the auditor pack and the workspace.

The **model layer** is a band of its own on the side — how the reader is made, served
and switched on, the document benchmark, and the system benchmark that scores readers on
what the books did rather than on field F1. It joins the main flow at exactly one point,
the reader in stage 2, which is the whole claim: the model is a source of readings that
code and the kernel then check, never a source of postings.

Written 20 Sep 2026 against `main` at `c5480e3`. It is **structure only** — the parts and
how they connect. No measurements, on purpose, so it does not go stale and does not have
to be re-audited: the numbers live in [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md),
[`../../README.md`](../../README.md), `ft/data/*.json` and `runs/reader-bench/*.json`,
and the workspace's Model page reads them with their n.

It follows the same syntax and colour conventions as the board below
([`architecture/CONVENTIONS.md`](./architecture/CONVENTIONS.md)) so it can be moved onto
that board, but it is **not** part of it and `architecture/tools/build.mjs` does not
rebuild it. Re-render it on its own:

```bash
cd context/diagrams
T=architecture/tools
$T/node_modules/.bin/mmdc -c $T/mermaid.config.json -i current-architecture.mmd -o current-architecture.svg
$T/node_modules/.bin/mmdc -c $T/mermaid.config.json -i current-architecture.mmd -o current-architecture.png -b white -s 1
```

## Target — what was planned, most of it not built

| File | What it shows |
|---|---|
| [`architecture/`](./architecture/README.md) | The 20-sheet target architecture board. Its own conventions file says plainly: *"the repo has no code yet. This is a target architecture."* It was drawn on 19 Sep before the build and has not been revised since, so it shows functions that were never built (equity, reporting, portal automation) and omits things that were (the post gate, the controller seat, the event bus, the reader). Read it as a plan, never as a description. |
| [`architecture.mmd`](./architecture.mmd) · [`pitch.mmd`](./pitch.mmd) | The two early one-slide pictures from 19 Sep, same caveat. |
