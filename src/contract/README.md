# src/contract — the one jointly owned directory

Frozen in Phase 0 (2026-09-19). **Changed only with both people in the conversation.** Everything else in
`src/` imports from here; nothing here imports from anywhere else in `src/`.

| File | What it freezes |
|---|---|
| `schema.sql` | Spec §7 tables with columns, plus the Phase 0 additions (marked `+P0`) |
| `types.ts` | `Proposal`, `Mark`, `Fn`, `Route`, `EscalationQuestion`, `FactCandidate`, `BusEvent` as zod schemas |
| `tools.ts` | Spec §8 tool names, who implements each, the auditor's denied list, the MCP-safe name mapping |
| `topics.ts` | The 50 event topics from `context/diagrams/architecture/EVENT_TOPICS.md` |
| `accounts.ts` | Core chart of accounts; AR `1100` and AP `2000` are the control accounts |
| `rules.ts` | The four Phase 0 decisions and the thresholds, as constants |
| `db.ts` | `openDb(path)` / `openMemoryDb()`: applies the schema, pragmas and chart. Use this, never `new Database()` |

Conventions: integer cents in `*_cents` (tables are STRICT, a float is an error) · text ids · dates `YYYY-MM-DD`,
timestamps ISO UTC, periods `YYYY-MM` · `bank_txn.amount_cents` is signed, + is money in · zod checks shape only;
balance, quotes and period status are kernel Marks, not parse errors.

Changing the schema: edit `schema.sql`, bump `SCHEMA_VERSION` in `db.ts`, delete `data/` and re-seed. There are
no migrations.

`pnpm check` runs the typecheck and `contract.test.ts`, which also asserts that the topic list and tool names
still match `EVENT_TOPICS.md` and spec §8.
