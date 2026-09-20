import { CaseFile, type AutonomyLevel, type Proposal } from "../contract/types.js";
import type { ApprovalLite } from "../kernel/types.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { parseProposal } from "./shared.js";

export interface SubjectApproval extends ApprovalLite {
  id: string;
  approved_at: string;
}

/** One posted decision, loaded whole: what was proposed, who signed it, and the case it answered. */
export interface RerunSubject {
  decision_id: string;
  intent_id: string;
  actor: string;
  autonomy_level: AutonomyLevel;
  route: string | null;
  posted_at: string;
  proposal: Proposal;
  approval: SubjectApproval | null;
  /** The intent's case file, which may hold document balances as they stood before posting. */
  case_file: CaseFile | null;
  entry_id: string | null;
}

interface DecisionRow {
  id: string;
  intent_id: string;
  actor: string;
  autonomy_level: AutonomyLevel;
  route: string | null;
  posted_at: string | null;
  mode: string;
  proposal_json: string | null;
  case_json: string | null;
}

/** Null when the decision is missing, never took effect live, or no longer carries a readable proposal. */
export function loadSubject(db: Db, decisionId: string): RerunSubject | null {
  const row = db
    .prepare(
      `SELECT d.id, d.intent_id, d.actor, d.autonomy_level, d.route, d.posted_at, d.mode, d.proposal_json, i.case_json
       FROM decision d JOIN intent i ON i.id = d.intent_id
       WHERE d.id = ?`,
    )
    .get(decisionId) as DecisionRow | undefined;
  if (!row || row.mode !== "live" || !row.posted_at) return null;
  const proposal = parseProposal(row.proposal_json);
  if (!proposal) return null;
  return {
    decision_id: row.id,
    intent_id: row.intent_id,
    actor: row.actor,
    autonomy_level: row.autonomy_level,
    route: row.route,
    posted_at: row.posted_at,
    proposal,
    approval: readApproval(db, decisionId),
    case_file: readCaseFile(row.case_json),
    entry_id: readEntryId(db, decisionId),
  };
}

/** The approval the entry posted on: the last one recorded that let it through. */
function readApproval(db: Db, decisionId: string): SubjectApproval | null {
  const row = db
    .prepare(
      `SELECT id, approver_id, approver_kind, outcome, approved_at FROM approval
       WHERE decision_id = ? AND outcome IN ('approved','corrected') ORDER BY rowid DESC LIMIT 1`,
    )
    .get(decisionId) as SubjectApproval | undefined;
  return row ?? null;
}

function readCaseFile(caseJson: string | null): CaseFile | null {
  if (!caseJson) return null;
  const parsed = CaseFile.safeParse(safeJson(caseJson));
  return parsed.success ? parsed.data : null;
}

function readEntryId(db: Db, decisionId: string): string | null {
  const row = db
    .prepare("SELECT id FROM gl_entry WHERE source_decision_id = ? ORDER BY id LIMIT 1")
    .get(decisionId) as { id: string } | undefined;
  return row?.id ?? null;
}
