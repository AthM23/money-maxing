# context/

Shared source of truth for this project. Humans and agents both read from here
*before* starting work, and write to here *after* anything notable happens.

## Files

| File | What it's for |
|---|---|
| `PROJECT_STATUS.md` | Living log: current state, decisions, approaches tried (and abandoned), open questions. **Append here on every major change.** |
| `judge-interview-2026-09-19.md` | Summary + raw transcript of our conversation with the hackathon judge. Defines what "good" looks like for this build. |
| `PROJECT_SPEC.md` | Proposed final spec: what we build, frozen schema and tool interface, lanes, checkpoints, cut order, demo. Status is recorded in `PROJECT_STATUS.md`. |
| `ROADMAP.md` | Proposed split of the build between two people (Person A: judgment and learning; Person B: world, engines, surface), with phases, sync points and a cut list. |
| `diagrams/` | Mermaid sources and PNG renders of the v3 architecture overview and the one-slide pitch diagram. |
| `diagrams/architecture/` | The full architecture board: 20 sheets (Mermaid sources, SVG renders, editable Excalidraw board), conventions, event topic list, rebuild tooling. Start at its `README.md`. |
| `research/` | Everything gathered before the build: track brief, workshop slides, sponsor intel, past winners, stack and sandbox notes. Start at `research/README.md`. |

## Rules for agents

1. **Read `PROJECT_STATUS.md` first.** It exists specifically so you don't re-try
   an approach that already failed. If an approach is listed under "Tried &
   rejected", do not re-propose it without new evidence.
2. **Write to `PROJECT_STATUS.md` when:** a direction changes, an approach is
   picked or abandoned, a dependency/integration is chosen, a major component
   lands, or you get blocked on something a human has to answer.
3. **Entries are append-only and dated.** Don't rewrite history — add a new
   entry and mark the old one superseded.
4. Keep it factual. Status ≠ marketing copy.
