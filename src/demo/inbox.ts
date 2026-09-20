import { recordHumanAnswer } from "../agents/humanLoop.js";
import { approvePolicy } from "../learn/compile.js";
import { approveFact, factCandidates, rejectFact } from "../memory/facts.js";
import { APP_CONFIG } from "../packs/index.js";
import { approveDecision } from "../runtime/approve.js";
import { systemClock } from "../runtime/config.js";
import { openDb, type Db } from "../runtime/db.js";

const out = (line: string): void => { process.stdout.write(`${line}\n`); };

/**
 * The human side without Slack. Same functions the Slack transport calls, so identity checks and the kernel's
 * post gate apply unchanged.
 *   pnpm inbox <db> list
 *   pnpm inbox <db> answer <escalation_id> --as U_SAM --treatment credit_memo --text "One-time credit for ..." [--uses standing --valid-to 2027-06-30]
 *        [--pct-off 2]        a rate, remembered as a rate: it books 2% of the invoice now and explains next month's different amount
 *        [--pct-withheld 10]  the same for tax deducted at source
 *   pnpm inbox <db> approve|reject <decision_id> --as U_CTRL
 *   pnpm inbox <db> approve-policy <policy_id> --as U_CTRL
 *   pnpm inbox <db> reopen <intent_id> --as U_CTRL
 *   pnpm inbox <db> approve-fact|reject-fact <fact_id> --as U_CTRL
 */
function main(): number {
  const [dbPath, command, id, ...rest] = process.argv.slice(2);
  if (!dbPath || !command) {
    process.stderr.write("usage: pnpm inbox <db> list | answer <escalation_id> --as U --treatment T --text \"...\" | approve <decision_id> --as U | reject <decision_id> --as U | approve-policy <policy_id> --as U | reopen <intent_id> --as U | approve-fact <fact_id> --as U | reject-fact <fact_id> --as U\n");
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
    const r = recordHumanAnswer(db, id, flags.as, { treatment: flags.treatment, text: flags.text, uses: flags.uses ?? "one_time", valid_to: flags["valid-to"],
      pct_off: percent(flags["pct-off"]), pct_withheld: percent(flags["pct-withheld"]) });
    out(JSON.stringify(r, null, 2));
    return r.status === "answered" ? 0 : 1;
  }
  if (command === "approve" || command === "reject") {
    const r = approveDecision(db, id, { approver_id: flags.as, approver_kind: "human", outcome: command === "approve" ? "approved" : "rejected" }, { config: APP_CONFIG });
    out(JSON.stringify(r, null, 2));
    return r.status === "posted" || r.status === "declined" ? 0 : 1;
  }
  if (command === "approve-fact" || command === "reject-fact") {
    const r = command === "approve-fact" ? approveFact(db, systemClock, id, flags.as) : rejectFact(db, systemClock, id, flags.as);
    out(JSON.stringify(r, null, 2));
    return r.status === "active" || r.status === "rejected" ? 0 : 1;
  }
  if (command === "reopen") {
    // Hand a waiting case back to the worker, e.g. once the model tiers are switched on. The next pass re-settles it.
    const info = db.prepare("UPDATE intent SET status = 'open', closed_at = NULL WHERE id = ? AND status = 'waiting_on_human'").run(id);
    out(info.changes === 1 ? `${id} reopened by ${flags.as}` : `${id} is not waiting on a person`);
    return info.changes === 1 ? 0 : 1;
  }
  if (command === "approve-policy") {
    const r = approvePolicy(db, systemClock, id, flags.as);
    out(JSON.stringify(r, null, 2));
    return r.status === "approved" ? 0 : 1;
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
  listPolicyDrafts(db);
  const facts = factCandidates(db);
  out(`facts an agent proposes to remember: ${facts.length}`);
  for (const f of facts) out(`  ${f.id} · ${f.party_id} · ${f.predicate} ${JSON.stringify(f.value)} · ${f.uses} · for ${f.kinds.join(", ")} · ${f.valid_from} to ${f.valid_to} · sources ${f.source_trace_ids.join(", ")}`);
  return 0;
}

/** A compiled rule is approved like a pull request: the reviewer sees what it would have done to every closed case. */
function listPolicyDrafts(db: Db): void {
  const drafts = db.prepare("SELECT id, name, backtest_json FROM policy WHERE status = 'proposed' ORDER BY rowid").all() as
    { id: string; name: string; backtest_json: string | null }[];
  out(`policy drafts: ${drafts.length}`);
  for (const d of drafts) {
    const bt = JSON.parse(d.backtest_json ?? "{}") as { n?: number; agree?: number; account_outliers?: string[] };
    out(`  ${d.id} · ${d.name}\n    backtest: matched ${bt.n ?? 0}, humans did exactly this ${bt.agree ?? 0}, other account ${(bt.account_outliers ?? []).length}`);
  }
}

/** A percentage flag as a number; anything else is passed through so the answer's own validation refuses it by name. */
function percent(raw: string | undefined): number | undefined {
  return raw === undefined ? undefined : Number(raw);
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
