# AGENTS.md

## Read the status file first

[`context/PROJECT_STATUS.md`](./context/PROJECT_STATUS.md) is the source of truth.
Read it before proposing a direction, writing code, or answering where the project
stands. It has a **Tried & rejected** table — that's the point of the file. If an
idea is in it, don't re-propose it without new evidence, and say what changed.

## Write to it when something notable happens

Append a dated entry to its Log when a direction changes, an approach is picked or
abandoned, a dependency or model choice is made, a major component lands, or work
is blocked on a human answer. Abandoned approaches go in **Tried & rejected** with
the reason. Append-only — mark old entries superseded rather than rewriting them.
Keep it factual: label proposals as proposed, unverified numbers as unverified.

## The project

An autonomous finance-ops agent system for the Office of the CFO, built for a 24h
hackathon. The thesis is that preparing financial statements is the terminal step
and not the hard part — the hard part is collecting context scattered across
people, systems and inboxes, and getting it booked correctly. A human is pulled in
only when an agent is genuinely blocked, and that answer must be stored with its
scope and applied automatically thereafter, so it's asked once.

Full brief: [`context/judge-interview-2026-09-19.md`](./context/judge-interview-2026-09-19.md).
