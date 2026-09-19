# context/

Shared source of truth for this project. Humans and agents both read from here
*before* starting work, and write to here *after* anything notable happens.

## Files

| File | What it's for |
|---|---|
| `PROJECT_STATUS.md` | Living log: current state, decisions, approaches tried (and abandoned), open questions. **Append here on every major change.** |
| `judge-interview-2026-09-19.md` | Summary + raw transcript of our conversation with the hackathon judge. Defines what "good" looks like for this build. |

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
