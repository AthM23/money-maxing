import type { Proposal } from "../contract/types.js";
import type { Db } from "../runtime/db.js";
import { PERIOD_PREDICATE, entryAmountCents, finding, groupBy, normaliseVendorName, parseProposal } from "./shared.js";
import type { AgentApprovedShare, ControlTestResults, Finding } from "./types.js";

/** A payment out that is a round multiple of this, and at least this big, is worth a second look. */
const ROUND_STEP_CENTS = 100_000;
const ROUND_FLOOR_CENTS = 500_000;
/** "Just under" means within 5% below a line. Kept as integers: amount * 100 >= line * 95. */
const JUST_UNDER_NUMERATOR = 95;

export interface ControlInput {
  period: string;
  materiality_cents: number;
}

interface PostedRow {
  decision_id: string;
  actor: string;
  proposal: Proposal;
  amount_cents: number;
  approver_id: string | null;
  approver_kind: string | null;
  limit_cents: number | null;
}

/**
 * The control tests: pure SQL and code over what is on file. Each one names the rows involved, because
 * a finding a person cannot look up is a rumour.
 */
export function runControlTests(db: Db, input: ControlInput): ControlTestResults {
  const posted = readPosted(db, input.period);
  return {
    findings: [
      ...duplicateVendors(db),
      ...roundNumberPayments(db, input.period),
      ...entriesAfterLock(db, input.period),
      ...selfApprovals(db, input.period),
      ...justUnderTheLine(posted, input.materiality_cents),
      ...splitTransactions(posted, input),
    ],
    agent_approved: agentApprovedShare(posted),
  };
}

/** Two vendor rows for one vendor is how a payment goes out twice, and how a fake one hides. */
function duplicateVendors(db: Db): Finding[] {
  const rows = db
    .prepare("SELECT id, name, remit_to_json FROM party WHERE kind = 'vendor' ORDER BY id")
    .all() as { id: string; name: string; remit_to_json: string | null }[];
  const byName = collisions(groupBy(rows, (row) => normaliseVendorName(row.name)));
  const withRemit = rows.filter((row) => row.remit_to_json !== null && row.remit_to_json.trim() !== "");
  const byRemit = collisions(groupBy(withRemit, (row) => row.remit_to_json ?? ""));
  return [
    ...byName.map(([key, group]) => vendorFinding(`normalised name "${key}"`, group)),
    ...byRemit.map(([, group]) => vendorFinding("identical remit_to details", group)),
  ];
}

function collisions<T>(groups: Map<string, T[]>): [string, T[]][] {
  return [...groups.entries()].filter(([, group]) => group.length > 1);
}

function vendorFinding(on: string, group: { id: string; name: string }[]): Finding {
  const names = group.map((row) => `${row.id} (${row.name})`).join(", ");
  return finding("duplicate_vendor", `${group.length} vendor parties collide on ${on}: ${names}`, {
    party_ids: group.map((row) => row.id),
  });
}

/** Real invoices are rarely round. A payment out in exact thousands is a screen hit, not a verdict. */
function roundNumberPayments(db: Db, period: string): Finding[] {
  const rows = db
    .prepare(
      `SELECT id, posted_date, amount_cents, descriptor, party_id FROM bank_txn
       WHERE amount_cents < 0 AND substr(posted_date, 1, length(?)) = ?
         AND (-amount_cents) % ? = 0 AND (-amount_cents) >= ?
       ORDER BY id`,
    )
    .all(period, period, ROUND_STEP_CENTS, ROUND_FLOOR_CENTS) as
    { id: string; posted_date: string; amount_cents: number; descriptor: string; party_id: string | null }[];
  return rows.map((row) =>
    finding("round_number_payment", `${row.id} on ${row.posted_date} pays ${-row.amount_cents} cents exactly: "${row.descriptor}"`, {
      bank_txn_id: row.id,
      party_id: row.party_id ?? undefined,
    }),
  );
}

/** A period lock that lets entries through afterwards is a control that does not operate. */
function entriesAfterLock(db: Db, period: string): Finding[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.posted_at, g.source_decision_id, p.locked_at
       FROM gl_entry g JOIN period p ON p.id = g.period
       WHERE g.period = ? AND p.locked_at IS NOT NULL AND g.posted_at > p.locked_at
       ORDER BY g.id`,
    )
    .all(period) as { id: string; posted_at: string; source_decision_id: string; locked_at: string }[];
  return rows.map((row) =>
    finding("post_lock_entry", `entry ${row.id} posted at ${row.posted_at}, after period ${period} locked at ${row.locked_at}`, {
      entry_id: row.id,
      decision_id: row.source_decision_id,
      period,
    }),
  );
}

/** Segregation of duties, tested on the rows rather than on the rule that was supposed to stop it. */
function selfApprovals(db: Db, period: string): Finding[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.decision_id, a.approver_id, a.outcome, d.actor
       FROM approval a JOIN decision d ON d.id = a.decision_id
       WHERE a.approver_id = d.actor AND ${PERIOD_PREDICATE}
       ORDER BY a.id`,
    )
    .all(period, period) as { id: string; decision_id: string; approver_id: string; outcome: string; actor: string }[];
  return rows.map((row) =>
    finding("self_approval", `${row.approver_id} prepared and ${row.outcome} decision ${row.decision_id}`, {
      decision_id: row.decision_id,
      approver_id: row.approver_id,
    }),
  );
}

/** An amount that stops just short of a line it would otherwise have to cross is worth asking about. */
function justUnderTheLine(posted: readonly PostedRow[], materialityCents: number): Finding[] {
  const out: Finding[] = [];
  for (const row of posted) {
    const refs = { decision_id: row.decision_id, approver_id: row.approver_id ?? undefined };
    if (justUnder(row.amount_cents, materialityCents)) {
      out.push(finding("just_under_threshold", `entry moves ${row.amount_cents} cents, just under materiality ${materialityCents}`, refs));
    }
    const limit = row.limit_cents;
    if (limit !== null && justUnder(row.amount_cents, limit)) {
      out.push(finding("just_under_threshold", `entry moves ${row.amount_cents} cents, just under ${row.approver_id}'s limit ${limit}`, refs));
    }
  }
  return out;
}

function justUnder(amountCents: number, lineCents: number): boolean {
  if (lineCents <= 0 || amountCents >= lineCents) return false;
  return amountCents * 100 >= lineCents * JUST_UNDER_NUMERATOR;
}

/** Several small adjustments to one party in one period that add up to a big one: a split transaction. */
function splitTransactions(posted: readonly PostedRow[], input: ControlInput): Finding[] {
  const small = posted.filter((row) => row.amount_cents > 0 && row.amount_cents < input.materiality_cents);
  const groups = groupBy(small, (row) => row.proposal.party_id);
  const out: Finding[] = [];
  for (const [partyId, group] of groups) {
    const total = group.reduce((sum, row) => sum + row.amount_cents, 0);
    if (group.length < 2 || total < input.materiality_cents) continue;
    const detail =
      `${group.length} sub-materiality adjustments to ${partyId} in ${input.period} total ${total} cents, ` +
      `at or above materiality ${input.materiality_cents}`;
    out.push(finding("split_transaction", detail, { party_id: partyId, period: input.period, decision_ids: group.map((row) => row.decision_id) }));
  }
  return out;
}

/** Information, not a finding: how much of the period one agent signed off for another. */
function agentApprovedShare(posted: readonly PostedRow[]): AgentApprovedShare {
  const agentApproved = posted.filter((row) => row.approver_kind === "controller_agent").length;
  return {
    posted: posted.length,
    agent_approved: agentApproved,
    share: posted.length === 0 ? 0 : agentApproved / posted.length,
  };
}

/** Everything that took effect in the period, with the approval it went out on, read once. */
function readPosted(db: Db, period: string): PostedRow[] {
  const rows = db
    .prepare(
      `SELECT d.id AS decision_id, d.actor, d.proposal_json, a.approver_id, a.approver_kind, ap.limit_cents
       FROM decision d
       LEFT JOIN approval a ON a.decision_id = d.id AND a.outcome IN ('approved','corrected')
       LEFT JOIN approver ap ON ap.id = a.approver_id
       WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND d.proposal_json IS NOT NULL AND ${PERIOD_PREDICATE}
       ORDER BY d.id`,
    )
    .all(period, period) as
    { decision_id: string; actor: string; proposal_json: string; approver_id: string | null; approver_kind: string | null; limit_cents: number | null }[];
  const out: PostedRow[] = [];
  for (const row of rows) {
    const proposal = parseProposal(row.proposal_json);
    if (!proposal) continue; // the sample reports an unreadable proposal; the control tests skip it.
    out.push({ ...row, proposal, amount_cents: entryAmountCents(proposal) });
  }
  return out;
}
