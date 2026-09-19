# AGENTS.md

Instructions for any agent (or person) working in this repo. Read this first.

---

## 1. Read the status file before you do anything

**[`context/PROJECT_STATUS.md`](./context/PROJECT_STATUS.md) is the source of truth.**
Read it before proposing a direction, writing code, or answering a question about
where the project stands.

It exists for one specific reason: **so that nobody re-runs an approach that has
already been tried and dropped.** It has a "Tried & rejected" table. If an idea is
in it, do not re-propose it without new evidence — and if you have new evidence,
say what changed.

Also read, in this order, only as far as you need:

| File | When |
|---|---|
| [`context/PROJECT_STATUS.md`](./context/PROJECT_STATUS.md) | **Always.** Current state, decisions, dead ends, open questions. |
| [`context/judge-interview-2026-09-19.md`](./context/judge-interview-2026-09-19.md) | Before any direction or pitch work. The design brief and the judging criteria, straight from the sponsor. |
| [`tests/README.md`](./tests/README.md) | Before building or changing behaviour. The bar the system has to clear. |
| `context/PROJECT_SPEC.md` | The proposed build spec. **Lives on the `research/claude-session-notes` branch**, not on `main`. |
| `context/research/` | Sourced background: track brief, sponsor intel, stack findings, connector notes. Also on the research branch. |

---

## 2. Write to the status file when something notable happens

Append a dated entry to the Log section of `context/PROJECT_STATUS.md` when:

- a direction changes
- an approach is picked **or abandoned** (abandoned goes in "Tried & rejected", with the reason)
- a dependency, connector, or model choice is made
- a major component lands
- work gets blocked on something a human has to answer

Rules:

- **Append-only.** Don't rewrite history. Add a new entry and mark the old one
  superseded, with the date.
- **Date everything**, and convert relative dates ("tomorrow", "in an hour") to
  absolute ones.
- **Factual, not promotional.** Status is not a pitch. If something is proposed
  rather than agreed, label it proposed. If a number is unverified, say so.

---

## 3. Branches

| Branch | What's on it |
|---|---|
| `main` | Context folder, test corpus, this file. |
| `research/claude-session-notes` | Everything on `main`, plus the proposed spec (`PROJECT_SPEC.md`), the research folder, and architecture diagrams. Ahead of `main`. |

The spec on the research branch is **proposed, pending team sign-off** — it is not
a decision that has been made. Don't treat it as settled, and don't merge it to
`main` without the team agreeing.

`main` and the research branch have both edited `context/PROJECT_STATUS.md`. If you
are logging to it, log on the branch you're working on and let whoever merges
resolve it — don't try to sync them by hand.

---

## 4. Tests

[`tests/`](./tests/) holds an edge-case corpus for the Office of the CFO: 115 cases
in the hard tail of finance operations, each with an **expected route**.

The governing idea: **score the route, not the match.** Routes are `AUTO`,
`PROPOSE`, `ESCALATE`, `REFUSE`, `BLOCK`, plus `INVARIANT` for properties that must
hold everywhere. A system that matches 99% and can't say which 1% is wrong is worse
than one that matches 85% and partitions the rest correctly.

Two hard rules:

- **A wrong `AUTO` is the cardinal failure.** Auto-clear precision must be 100%.
  The eval exits non-zero on any false auto-post.
- **Only 18 of 115 cases are auto-clearable.** Do not optimise for auto-clear rate.

Start with the 22 cases flagged `min_fixture=yes` in
[`tests/cases.csv`](./tests/cases.csv). Ground truth is the corpus prose in
[`tests/edge-cases/office-of-the-cfo.md`](./tests/edge-cases/office-of-the-cfo.md),
never what the system currently does. Record outcomes in
[`tests/RESULTS.md`](./tests/RESULTS.md), including the unflattering ones.

---

## 5. Context this project is about

Worth knowing, because it shapes what "good" means here: the sponsor's thesis is
that preparing financial statements is the *terminal* step and not the hard part.
The hard part is collecting context scattered across people, systems and inboxes,
and getting it booked correctly. A system is judged on ambition, proximity to the
frontier, and the difficulty of the process it takes on.

Autonomy is a hard requirement. A human is pulled in **only** when an agent is
genuinely blocked on context — and that answer must be written to memory with its
scope, and applied automatically thereafter, so it is asked once. That
escalate → answer → remember loop is the thing being evaluated.

Details and the judge's own wording: `context/judge-interview-2026-09-19.md`.
