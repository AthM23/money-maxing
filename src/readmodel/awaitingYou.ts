import { factCandidates } from "../memory/facts.js";
import type { Db } from "../runtime/db.js";
import { safeJson } from "../runtime/lookups.js";
import { listParkedDecisions } from "./parked.js";
import { buildRules } from "./rules.js";
import type { AwaitingYou, CertificateFollowup, OpenQuestion, UploadedBill } from "./types.js";

/** Everything with a person's name on it: unanswered questions, parked entries, proposed facts, rule drafts and open certificate follow-ups. */
export function buildAwaitingYou(db: Db): AwaitingYou {
  return {
    open_questions: openQuestions(db),
    parked_entries: listParkedDecisions(db),
    proposed_facts: factCandidates(db),
    rule_drafts: buildRules(db).filter((r) => r.status === "proposed"),
    certificate_followups: certificateFollowups(db),
    uploaded_bills: uploadedBills(db),
  };
}

/** Bills filed from the pipeline page (id BILL-UP-…) still waiting for a person to accept or reject them. */
function uploadedBills(db: Db): UploadedBill[] {
  const rows = db.prepare(`SELECT b.id AS bill_id, p.name AS vendor, b.vendor_invoice_no AS ref, b.bill_date, b.service_period, b.total_cents,
        (SELECT COUNT(*) FROM bill o WHERE o.party_id = b.party_id AND o.id <> b.id) AS prior_bills,
        (SELECT AVG(o.total_cents) FROM bill o WHERE o.party_id = b.party_id AND o.id <> b.id) AS avg_cents
      FROM bill b JOIN party p ON p.id = b.party_id WHERE b.status = 'open' AND b.id LIKE 'BILL-UP-%' ORDER BY b.bill_date DESC`)
    .all() as { bill_id: string; vendor: string; ref: string; bill_date: string; service_period: string; total_cents: number; prior_bills: number; avg_cents: number | null }[];
  return rows.map((r) => ({ ...r, avg_cents: r.avg_cents === null ? null : Math.round(r.avg_cents) }));
}

function openQuestions(db: Db): OpenQuestion[] {
  const rows = db.prepare(
    `SELECT e.id AS escalation_id, e.decision_id, d.intent_id, e.asked_user, e.question_json, e.asked_at
       FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE e.answered_at IS NULL ORDER BY e.asked_at`,
  ).all() as { escalation_id: string; decision_id: string; intent_id: string; asked_user: string; question_json: string; asked_at: string }[];
  return rows.map((r) => ({
    escalation_id: r.escalation_id, decision_id: r.decision_id, intent_id: r.intent_id, asked_user: r.asked_user,
    question: safeJson(r.question_json), asked_at: r.asked_at,
  }));
}

/** A tax-withholding posting opens a follow-up intent (runtime/post.ts) with no case_json, so no agent ever picks it up. */
function certificateFollowups(db: Db): CertificateFollowup[] {
  const rows = db.prepare("SELECT id, parent_id, function, question, owner, created_at FROM intent WHERE parent_id IS NOT NULL AND case_json IS NULL ORDER BY created_at")
    .all() as { id: string; parent_id: string; function: string; question: string; owner: string; created_at: string }[];
  return rows.map((r) => ({ intent_id: r.id, parent_id: r.parent_id, function: r.function, question: r.question, owner: r.owner, created_at: r.created_at }));
}
