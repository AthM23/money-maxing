import { CaseFile, REDUCES_INVOICE_KINDS } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { UNSETTLED_ACTOR } from "../runtime/intentStatus.js";
import { getDoc, safeJson } from "../runtime/lookups.js";

export interface PickedIntent {
  intent_id: string;
  function: string;
  case_file: CaseFile;
}

export interface SkippedIntent {
  intent_id: string;
  reason: string;
}

export interface PickupFilter {
  function?: string;
  limit?: number;
  /** True when this pass has model tiers. Without them, a case only code has already tried is not tried again. */
  has_model_tiers?: boolean;
  /** Try every open case again regardless, e.g. after the code itself was fixed. */
  retry?: boolean;
  /** Work this one case only. */
  intent_id?: string;
}

interface IntentRow { id: string; function: string; case_json: string }

/**
 * The hand-off from the drift monitor: open intents that carry a case file, oldest first. A case file that does
 * not parse, or that names another intent, is handed to a person with the reason; it is never run on a guess.
 */
export function pickOpenIntents(db: Db, filter: PickupFilter = {}): { ready: PickedIntent[]; skipped: SkippedIntent[] } {
  const rows = (db
    .prepare(
      `SELECT id, function, case_json FROM intent
       WHERE status = 'open' AND case_json IS NOT NULL AND owner != 'replay' AND (? IS NULL OR function = ?)
       ORDER BY created_at, id`,
    )
    .all(filter.function ?? null, filter.function ?? null) as IntentRow[])
    .filter((row) => !filter.intent_id || row.id === filter.intent_id)
    .filter((row) => filter.retry || filter.has_model_tiers || worthAnotherCodePass(db, row.id))
    .slice(0, filter.limit ?? undefined);
  const ready: PickedIntent[] = [];
  const skipped: SkippedIntent[] = [];
  for (const row of rows) {
    const problem = problemWith(row);
    if (typeof problem === "string") {
      db.prepare("UPDATE intent SET status = 'waiting_on_human' WHERE id = ?").run(row.id);
      skipped.push({ intent_id: row.id, reason: problem });
      continue;
    }
    ready.push({ intent_id: row.id, function: row.function, case_file: withDocsSnapshot(db, row.id, problem) });
  }
  return { ready, skipped };
}

/**
 * Code already tried this case and could not settle it. Trying again in code is only worth it if memory has
 * changed since: a rule was approved, a fact was learned or approved, or a question was answered.
 */
function worthAnotherCodePass(db: Db, intentId: string): boolean {
  const newest = db
    .prepare("SELECT actor, created_at FROM decision WHERE intent_id = ? AND mode = 'live' ORDER BY rowid DESC LIMIT 1")
    .get(intentId) as { actor: string; created_at: string } | undefined;
  if (!newest || newest.actor !== UNSETTLED_ACTOR) return true;
  const changed = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM policy WHERE status = 'approved' AND approved_at > ?)
            + (SELECT COUNT(*) FROM fact WHERE status = 'active' AND learned_at > ?)
            + (SELECT COUNT(*) FROM event WHERE topic = 'fact.activated' AND ts > ?)
            + (SELECT COUNT(*) FROM escalation WHERE answered_at > ?) AS n`,
    )
    .get(newest.created_at, newest.created_at, newest.created_at, newest.created_at) as { n: number };
  return changed.n > 0;
}

function problemWith(row: IntentRow): CaseFile | string {
  const parsed = CaseFile.safeParse(safeJson(row.case_json));
  if (!parsed.success) return `case file does not parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  if (parsed.data.intent_id !== row.id) return `case file names intent ${parsed.data.intent_id}, not ${row.id}`;
  if (parsed.data.function !== row.function) return `case file is for ${parsed.data.function}, the intent is for ${row.function}`;
  const c = parsed.data;
  if (c.expected_cents - c.received_cents !== c.shortfall_cents) {
    return `case file does not add up: expected ${c.expected_cents} minus received ${c.received_cents} is not the stated shortfall ${c.shortfall_cents}`;
  }
  return parsed.data;
}

/** Kinds whose applications reduce a document's open balance when they post (see postEntry). */
const REDUCES_OPEN: readonly string[] = [...REDUCES_INVOICE_KINDS, "schedule_payment"];

/**
 * Keep the document balances as they stood before anything posted on this case. Live runs ignore the snapshot; it
 * is what lets the case be replayed, or an entry re-performed by the auditor, once the ledger shows the documents
 * settled. A case may already have had entries posted by an earlier pass, so what they took off is added back.
 */
function withDocsSnapshot(db: Db, intentId: string, c: CaseFile): CaseFile {
  if (c.docs_snapshot) return c;
  const docs = c.doc_ids.flatMap((id) => {
    const doc = getDoc(db, id);
    return doc ? [{ ...doc, open_cents: doc.open_cents + alreadyTakenOff(db, intentId, id) }] : [];
  });
  const withSnapshot: CaseFile = { ...c, docs_snapshot: docs };
  db.prepare("UPDATE intent SET case_json = ? WHERE id = ?").run(JSON.stringify(withSnapshot), intentId);
  return withSnapshot;
}

function alreadyTakenOff(db: Db, intentId: string, docId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(a.value ->> '$.amount_cents'), 0) AS n
       FROM decision d, json_each(json_extract(d.proposal_json, '$.applications')) a
       WHERE d.intent_id = ? AND d.mode = 'live' AND d.posted_at IS NOT NULL AND a.value ->> '$.doc_id' = ?
         AND d.kind IN (${REDUCES_OPEN.map(() => "?").join(", ")})`,
    )
    .get(intentId, docId, ...REDUCES_OPEN) as { n: number };
  return row.n;
}
