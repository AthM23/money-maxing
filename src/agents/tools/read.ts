import { z } from "zod";
import { CONNECTORS } from "../../connectors/registry.js";
import { applicableFacts } from "../../memory/applicability.js";
import type { ToolEnv } from "../env.js";
import { readTrace, searchTraces } from "./search.js";

/** One tool: a name the model sees, the spec §8 registry name, a zod input, and a handler over ToolEnv. */
export interface ToolSpec {
  name: string;
  registry_name: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  run(input: Record<string, unknown>, env: ToolEnv): unknown;
}

const Search = z.object({ query: z.string().min(2), party_id: z.string().optional() });
const Party = z.object({ party_id: z.string().min(1) });
const str = (v: unknown): string => String(v);

function searchTool(name: string, registry: string, sources: string[], what: string): ToolSpec {
  return {
    name, registry_name: registry, input: Search,
    description: `Search ${what}. Returns trace ids with snippets. Quote evidence only from text you have read with read_trace.`,
    run: (i, env) => searchTraces(env, sources, str(i.query), i.party_id ? str(i.party_id) : undefined),
  };
}

/**
 * One search tool per registered source that declares one. Registering a connector is therefore the whole job: the
 * investigator can search the new system on the next run, with no edit here and no change to any system prompt.
 */
export const SOURCE_SEARCH_TOOLS: ToolSpec[] = CONNECTORS
  .flatMap((c) => (c.tool ? [searchTool(c.tool.name, c.tool.registry_name, [c.source], c.tool.describes)] : []));

export const READ_TOOL_SPECS: ToolSpec[] = [
  ...SOURCE_SEARCH_TOOLS,
  {
    name: "read_trace", registry_name: "mail.get_thread", input: z.object({ trace_id: z.string().min(1) }),
    description: "Read the full text of one trace. Evidence quotes must be exact spans of this text.",
    run: (i, env) => readTrace(env, str(i.trace_id)) ?? { error: "no such trace (or not yet known at this point in time)" },
  },
  {
    name: "ledger_open_invoices", registry_name: "ledger.open_invoices", input: Party,
    description: "Open invoices for a customer, oldest first, amounts in integer cents.",
    run: (i, env) => (env.mode === "replay"
      ? (env.replay_docs ?? []).filter((d) => d.kind === "invoice" && d.party_id === str(i.party_id))
      : env.db.prepare("SELECT id, issue_date, due_date, total_cents, open_cents, status FROM invoice WHERE party_id = ? AND open_cents > 0 ORDER BY issue_date").all(str(i.party_id))),
  },
  {
    name: "bank_get_transaction", registry_name: "bank.get_transaction", input: z.object({ bank_txn_id: z.string().min(1) }),
    description: "One bank line: posted date, signed amount in cents, descriptor, method.",
    run: (i, env) => {
      const row = env.db.prepare("SELECT id, posted_date, amount_cents, descriptor, method, party_id FROM bank_txn WHERE id = ?")
        .get(str(i.bank_txn_id)) as { posted_date: string } | undefined;
      const hidden = row && env.mode === "replay" && env.as_of && row.posted_date > env.as_of.slice(0, 10);
      return row && !hidden ? row : { error: "no such bank line (or not yet posted at this point in time)" };
    },
  },
  {
    name: "crm_owner", registry_name: "crm.owner", input: Party,
    description: "The account owner for a party: the person to ask when context is missing.",
    run: (i, env) => env.db.prepare("SELECT id AS party_id, name, owner_user FROM party WHERE id = ?").get(str(i.party_id)) ?? { error: "no such party" },
  },
  {
    name: "memory_facts", registry_name: "memory.facts",
    input: z.object({ party_id: z.string().min(1), kind: z.string().min(1), entry_date: z.string().min(10), amount_cents: z.number().int() }),
    description: "Stored facts for a party. Code decides which apply; refused facts come back with the failed dimension named.",
    run: (i, env) => applicableFacts(env.db, {
      party_id: str(i.party_id), kind: str(i.kind) as never, entry_date: str(i.entry_date), amount_cents: Number(i.amount_cents), as_of: env.as_of,
    }),
  },
];
