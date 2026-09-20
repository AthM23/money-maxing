# Connectors

Finance work is blocked on context that is scattered across systems, so "which systems" must not be a design
decision baked into the agent. It is a list: [`registry.ts`](./registry.ts). Run `pnpm connectors` to print it.

A connector **never writes a table**. It fetches, shapes and dates. [`src/ingest/`](../ingest/) is the only writer of
`trace` and `bank_txn`, so every source — the ones shipped here and any added later — gets the same guarantees
without asking for them:

- **idempotent** on `(source, external_id)`; a re-pull of unchanged content is a no-op
- **versioned**: changed content becomes version *n+1*, the old version is kept, and decisions that cited it are
  flagged (`evidence.reversioned`)
- **three clocks kept apart**: `event_time` (when it happened), `recorded_time` (when the company's systems knew it),
  `ingested_at` (when we loaded it). Replay reads only `recorded_time <= T`, so an agent cannot see the future
- **content-hashed**, so an evidence quote can be tied back to exact bytes
- **entity resolution** from the alias table, never from the model

## Adding a source

Two steps.

**1. A module that maps the system's records to `RawItem`.**

```ts
export function localTickets(dir: string): Connector {
  return {
    name: "local-tickets",
    async pull(): Promise<RawItem[]> {
      return records.map((r) => ({
        source: "linear",              // the registry key
        kind: "issue",                 // the record type, for search and the console legend
        external_id: r.identifier,     // stable in the source system; with `source` it is the idempotency key
        event_time: r.created_at,
        recorded_time: r.updated_at,   // the SOURCE's clock, never ours
        payload: { title: r.title, body: r.body /* … */ },
        party_hint: { text: r.title }, // or { party_id } / { emails }
      }));
    },
  };
}
```

**2. One entry in `registry.ts`.**

```ts
{
  source: "linear",
  label: "Linear",
  about: "Engineering tickets: outages, SLA credits owed, and commitments that explain a short-pay.",
  kinds: ["issue", "comment"],
  local: localTickets,
  live: { env: ["LINEAR_API_KEY"], load: async () => new (await import("./linear.js")).LinearConnector() },
  tool: { name: "tickets_search", registry_name: "tickets.search", describes: "engineering tickets (Linear)" },
}
```

That is the whole job. Derived from that entry, with no other edit:

| Derived | Where |
|---|---|
| The source is pulled and ingested | `buildConnectors()` in [`index.ts`](./index.ts) |
| `--live=linear` becomes a valid flag on every CLI | `liveFromArgv()` |
| The investigator agent gets a `tickets_search` tool | `READ_TOOL_SPECS` in [`../agents/tools/read.ts`](../agents/tools/read.ts) |
| `trace.source = 'linear'` is accepted; an unregistered source is refused | `ingest()` in [`../ingest/ingest.ts`](../ingest/ingest.ts) |
| `TraceSource` widens, so a typo is a compile error | `registry.ts` |
| It shows up in `pnpm connectors`, with its credential state | [`cli.ts`](./cli.ts) |

One optional flag, `search_before_escalating: true`, adds the source to the gate the agent has to pass before it may
pull a person in (`SEARCH_PLAN` in [`../agents/tools/write.ts`](../agents/tools/write.ts)). It is off by default and
set today on contracts, the policy memo, Gmail and Slack. It is deliberately a decision rather than a consequence of
being connected: every source in the gate is searched on every case, including the ones that were never going to
escalate. Linear is connected but not in the gate.

No schema change and no migration: `trace.source` checks the shape of a slug, not a fixed list. No system prompt
change either — the AR prompt names no source, and tool descriptions come from the registry's own words.

## What is registered today

`pnpm connectors` is the current answer. At the time of writing: contracts, policy memos, CRM, Linear, Gmail, Slack,
the bank feed, the prior close workbook, and the QuickBooks mirror.

**Live vs local.** Every source has an offline store under `data/stores/` so the whole system runs with no
credentials. A live system *replaces* its local store rather than joining it — both carry the same records, and
pulling both would give every item two traces. Live modules are dynamically imported, so a missing key or SDK never
breaks a local run.

**The world filter.** Gmail and Slack are shared demo accounts that hold every world ever seeded into them. Those
defs carry a `world` block so a pull hands back only the current world's items; see `onlyThisWorld` in
[`index.ts`](./index.ts). A source with no seeder needs none.

## The worked example

[`linear.ts`](./linear.ts) exists to be read: it is the shortest honest answer to "can you connect anything?". It has
an offline store (covered by tests) and a live GraphQL pull behind `LINEAR_API_KEY`.

**Unverified:** the live Linear pull has not been run against a real workspace — there is no API key on the build
machine. The offline path is tested; the live path is typechecked only.

## Two rules worth keeping

1. **`recorded_time` is the source's clock.** If a connector stamps it with `Date.now()`, no-look-ahead replay
   silently breaks: every document appears to have existed from the start. Ingestion refuses a non-ISO timestamp but
   cannot tell a wrong one from a right one.
2. **Refuse a bad pull whole, never half-load it.** A connector that throws is caught per-connector, emits
   `ingest.refused`, and leaves the database untouched — the bank file parser is the model: structure validated
   before content, first failure refuses the file.
