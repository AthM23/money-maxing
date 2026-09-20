import { recordHumanAnswer } from "../agents/humanLoop.js";
import { approveDecision } from "../runtime/approve.js";
import { openDb, type Db } from "../runtime/db.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };

/**
 * The human side without Slack. Same functions the Slack transport calls, so identity checks and the kernel's
 * post gate apply unchanged.
 *   pnpm inbox <db> list
 *   pnpm inbox <db> answer <escalation_id> --as U_SAM --treatment credit_memo --text "One-time credit for ..." [--uses standing --valid-to 2027-06-30]
 *   pnpm inbox <db> approve|reject <decision_id> --as U_CTRL
 */
function main(): number {
  const [dbPath, command, id, ...rest] = process.argv.slice(2);
  if (!dbPath || !command) {
    process.stderr.write("usage: pnpm inbox <db> list | answer <escalation_id> --as U --treatment T --text \"...\" | approve <decision_id> --as U | reject <decision_id> --as U\n");
    return 1;
  }
  const db = openDb(dbPath);
  const flags = parseFlags(rest);
  if (command === "list") return list(db);
  if (!id || !flags.as) {
    process.stderr.write("an id and --as <user> are required\n");
    return 1;
  }
  if (command === "answer") {
    const r = recordHumanAnswer(db, id, flags.as, { treatment: flags.treatment, text: flags.text, uses: flags.uses ?? "one_time", valid_to: flags["valid-to"] });
    out(JSON.stringify(r, null, 2));
    return r.status === "answered" ? 0 : 1;
  }
  if (command === "approve" || command === "reject") {
    const r = approveDecision(db, id, { approver_id: flags.as, approver_kind: "human", outcome: command === "approve" ? "approved" : "rejected" });
    out(JSON.stringify(r, null, 2));
    return r.status === "posted" || r.status === "declined" ? 0 : 1;
  }
  process.stderr.write(`unknown command ${command}\n`);
  return 1;
}

function list(db: Db): number {
  const escalations = db.prepare("SELECT id, asked_user, question_json FROM escalation WHERE answered_at IS NULL ORDER BY asked_at").all() as
    { id: string; asked_user: string; question_json: string }[];
  out(`open escalations: ${escalations.length}`);
  for (const e of escalations) {
    const q = JSON.parse(e.question_json) as { what_happened?: string; what_is_unknown?: string; treatments?: { id: string; label: string }[] };
    out(`  ${e.id} → ${e.asked_user}\n    ${q.what_happened ?? ""}\n    unknown: ${q.what_is_unknown ?? ""}\n    treatments: ${(q.treatments ?? []).map((t) => t.id).join(" | ")}`);
  }
  const parked = db.prepare("SELECT id, kind, proposal_json FROM decision WHERE mode = 'live' AND route = 'PROPOSE' AND posted_at IS NULL ORDER BY rowid").all() as
    { id: string; kind: string; proposal_json: string }[];
  out(`pending approvals: ${parked.length}`);
  for (const p of parked) {
    const proposal = JSON.parse(p.proposal_json) as { party_id: string; entries: { account: string; debit_cents: number; credit_cents: number }[]; evidence: { quote?: string }[] };
    const lines = proposal.entries.map((l) => `${l.account} Dr ${l.debit_cents} Cr ${l.credit_cents}`).join("; ");
    out(`  ${p.id} · ${p.kind} · ${proposal.party_id} · ${lines}${proposal.evidence[0]?.quote ? `\n    evidence: “${proposal.evidence[0].quote}”` : ""}`);
  }
  return 0;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key?.startsWith("--") && value !== undefined) flags[key.slice(2)] = value;
  }
  return flags;
}

process.exit(main());
