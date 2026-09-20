import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localConnectors } from "../../../connectors/local.js";
import { ACCOUNTS } from "../../../contract/accounts.js";
import { traceId } from "../../../ingest/ids.js";
import { ingestAll } from "../../../ingest/ingest.js";
import { openWorldDb, type Db } from "../../../ledger/db.js";
import { approveDecision } from "../../../runtime/approve.js";
import type { Clock } from "../../../runtime/config.js";
import { proposeEntry } from "../../../runtime/proposeEntry.js";
import { seedLocal, writeStores } from "../../../seed/local.js";
import type { World } from "../../../seed/world.js";

export const clock: Clock = { now: () => "2026-09-19T12:00:00Z" };
export const CEO_QUOTE = "Initech gets 10% off the platform fee through renewal on 2027-06-30";
export const INITECH = "CTR-initech-2026";

const world = JSON.parse(readFileSync("world/northwind.json", "utf8")) as World;

/** The real world, seeded, with every local source ingested so the CEO email and the contracts exist as traces. */
export async function seededWorld(): Promise<Db> {
  const db = openWorldDb();
  seedLocal(db, world);
  const dir = mkdtempSync(join(tmpdir(), "footnote-rev-"));
  writeStores(world, dir);
  await ingestAll(db, localConnectors(dir));
  return db;
}

export interface MemoOpts { debit?: string; terms_change?: { pct_off?: number; until?: string }; intent_id?: string; amount_cents?: number }

/**
 * Person A's real path: an AR intent, a credit_memo proposal quoting the CEO email, the kernel, a human approval,
 * postEntry, and with it the `ar.credit_memo.posted` event the revenue engine listens for.
 */
export function postInitechMemo(db: Db, opts: MemoOpts = {}): { decision_id: string; intent_id: string } {
  const intentId = opts.intent_id ?? "int_initech_short";
  const cents = opts.amount_cents ?? 120_000;
  db.prepare("INSERT OR IGNORE INTO intent (id, function, question, owner, status, created_at) VALUES (?, 'ar', 'Resolve the $1,200 Initech shortfall', 'ar', 'open', ?)").run(intentId, clock.now());
  const proposed = proposeEntry(db, {
    intent_id: intentId, function: "ar", kind: "credit_memo", party_id: "initech", entry_date: "2026-07-14",
    applications: [{ doc_id: "INV-1042", amount_cents: cents }],
    entries: [
      { account: opts.debit ?? ACCOUNTS.deferred_revenue, debit_cents: cents, credit_cents: 0, memo: "Concession per CEO email" },
      { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: cents, memo: "Concession per CEO email" },
    ],
    ...(opts.terms_change ? { terms_change: opts.terms_change } : {}),
    evidence: [{ claim: "CEO granted 10% off through renewal", trace_id: traceId("gmail", "m-initech-2"), quote: CEO_QUOTE }],
    policy_refs: [], fact_refs: [], judgment: [],
  }, { mode: "live", actor: "agent:test", autonomy_level: "auto", tier: 1 }, { clock });
  if (proposed.status === "posted") return { decision_id: proposed.decision_id, intent_id: intentId }; // under materiality: no approval needed
  if (proposed.status !== "pending_approval") throw new Error(`credit memo did not park for approval: ${JSON.stringify(proposed)}`);
  const approved = approveDecision(db, proposed.decision_id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock });
  if (approved.status !== "posted") throw new Error(`credit memo approval did not post: ${JSON.stringify(approved)}`);
  return { decision_id: proposed.decision_id, intent_id: intentId };
}

export const count = (db: Db, sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;
