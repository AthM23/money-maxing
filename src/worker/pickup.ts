import { CaseFile } from "../contract/types.js";
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
    .filter((row) => filter.has_model_tiers || worthAnotherCodePass(db, row.id))
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
 * changed since: a rule was approved, a fact became active, or a question was answered.
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
            + (SELECT COUNT(*) FROM escalation WHERE answered_at > ?) AS n`,
    )
    .get(newest.created_at, newest.created_at, newest.created_at) as { n: number };
  return changed.n > 0;
}

function problemWith(row: IntentRow): CaseFile | string {
  const parsed = CaseFile.safeParse(safeJson(row.case_json));
  if (!parsed.success) return `case file does not parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  if (parsed.data.intent_id !== row.id) return `case file names intent ${parsed.data.intent_id}, not ${row.id}`;
  if (parsed.data.function !== row.function) return `case file is for ${parsed.data.function}, the intent is for ${row.function}`;
  return parsed.data;
}

/**
 * Keep the document balances as they stood before anything posted. Live runs ignore the snapshot; it is what lets
 * this case be replayed later, once the ledger shows the documents settled.
 */
function withDocsSnapshot(db: Db, intentId: string, c: CaseFile): CaseFile {
  if (c.docs_snapshot) return c;
  const docs = c.doc_ids.flatMap((id) => {
    const doc = getDoc(db, id);
    return doc ? [doc] : [];
  });
  const withSnapshot: CaseFile = { ...c, docs_snapshot: docs };
  db.prepare("UPDATE intent SET case_json = ? WHERE id = ?").run(JSON.stringify(withSnapshot), intentId);
  return withSnapshot;
}
