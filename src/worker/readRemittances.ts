import { parseRemittance, remittanceProvenanceProblems } from "../contract/remittance.js";
import type { CaseFile } from "../contract/types.js";
import { RemittanceRead, type DocumentReader } from "../reader/types.js";
import type { Clock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { getBankTxn, getDoc } from "../runtime/lookups.js";
import { payloadText } from "../runtime/payloadText.js";
import { openDecision } from "../runtime/persist.js";
import type { PickedIntent } from "./pickup.js";

export interface RemittanceReading {
  intent_id: string;
  trace_id: string;
  reader: string;
  outcome: "applied" | "rejected";
  /** Why a reading was not used: the reply was not JSON, an amount the customer never wrote, a total off the bank line. */
  reason?: string;
  latency_ms: number;
}

type Allocation = { doc_id: string; amount_cents: number };
const DAY_MS = 86_400_000;

/**
 * When the drift monitor could not tell which invoices a payment is for, the customer's remittance advice usually
 * says, in ordinary mail. A small model reads it; code decides whether to believe the reading: the total must be the
 * bank line to the cent, every invoice must be this customer's and open, and every number must be in the customer's
 * own words next to its invoice. A reading that fails is dropped with the reason and the case goes on as before.
 */
export async function readRemittances(db: Db, reader: DocumentReader, intents: PickedIntent[], clock: Clock): Promise<RemittanceReading[]> {
  const readings: RemittanceReading[] = [];
  for (const intent of intents) {
    const c = intent.case_file;
    if (!c.matching_issue || c.remittance || !c.bank_txn_id) continue;
    const accepted: { trace_id: string; allocations: Allocation[] }[] = [];
    for (const mail of candidateMail(db, c)) {
      const outcome = await reader.read(mail.text);
      const verdict = outcome.ok ? judge(db, c, mail.text, outcome.doc) : { problem: outcome.reason };
      const reading: RemittanceReading = { intent_id: c.intent_id, trace_id: mail.trace_id, reader: reader.name,
        outcome: "problem" in verdict ? "rejected" : "applied", reason: "problem" in verdict ? verdict.problem : undefined, latency_ms: outcome.latency_ms };
      readings.push(reading);
      recordReading(db, clock, c, reading, outcome.ok ? outcome : undefined);
      if (!("problem" in verdict)) accepted.push({ trace_id: mail.trace_id, allocations: verdict.allocations });
    }
    // Two remittances that both fit the same receipt are a person's to untangle.
    if (accepted.length === 1) intent.case_file = adopt(db, c, accepted[0]!);
  }
  return readings;
}

/** Mail from this customer around the payment date that names one of their open invoices and is not already in the fixed format. */
function candidateMail(db: Db, c: CaseFile): { trace_id: string; text: string }[] {
  const bank = getBankTxn(db, c.bank_txn_id ?? "");
  if (!bank) return [];
  const paid = Date.parse(`${bank.posted_date}T00:00:00Z`);
  const open = (db.prepare("SELECT id FROM invoice WHERE party_id = ? AND open_cents > 0").all(c.party_id) as { id: string }[]).map((r) => r.id);
  const rows = db.prepare(
    `SELECT t.id, t.recorded_time, t.payload_json FROM trace t WHERE t.source = 'gmail' AND t.party_id = ?
       AND NOT EXISTS (SELECT 1 FROM trace n WHERE n.source = t.source AND n.external_id = t.external_id AND n.version > t.version)
     ORDER BY t.recorded_time DESC`,
  ).all(c.party_id) as { id: string; recorded_time: string; payload_json: string }[];
  return rows
    .filter((r) => { const at = Date.parse(r.recorded_time); return at >= paid - 10 * DAY_MS && at <= paid + 3 * DAY_MS; })
    .map((r) => ({ trace_id: r.id, text: payloadText(r.payload_json) }))
    .filter((m) => parseRemittance(m.text) === null && open.some((id) => m.text.includes(id)))
    .slice(0, 3);
}

function judge(db: Db, c: CaseFile, text: string, doc: unknown): { allocations: Allocation[] } | { problem: string } {
  const read = RemittanceRead.safeParse(doc);
  if (!read.success) return { problem: `the reading is not a remittance: ${read.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const bank = getBankTxn(db, c.bank_txn_id ?? "");
  if (!bank || read.data.amount_cents !== bank.amount_cents) return { problem: `the reading says ${read.data.amount_cents} was paid, the bank line is ${bank?.amount_cents ?? "missing"}` };
  if (read.data.discount_cents > 0 && read.data.applications.length > 1) return { problem: "a deduction claimed across several invoices is a person's to allocate" };
  const allocations = read.data.applications.map((a) => ({ doc_id: a.invoice,
    amount_cents: read.data.discount_cents > 0 ? read.data.amount_cents : a.amount_cents }));
  for (const a of allocations) {
    const inv = getDoc(db, a.doc_id);
    if (!inv || inv.kind !== "invoice" || inv.party_id !== c.party_id) return { problem: `${a.doc_id} is not an invoice of this customer` };
    if (inv.open_cents < a.amount_cents) return { problem: `${a.doc_id} has ${inv.open_cents} open, the reading applies ${a.amount_cents}` };
  }
  const problems = remittanceProvenanceProblems(text, allocations, bank.amount_cents);
  return problems.length > 0 ? { problem: problems.join("; ") } : { allocations };
}

/** The case now names the invoices the customer named. What stays short on them is still to be explained. */
function adopt(db: Db, c: CaseFile, accepted: { trace_id: string; allocations: Allocation[] }): CaseFile {
  const docIds = accepted.allocations.map((a) => a.doc_id);
  const expected = docIds.reduce((n, id) => n + (getDoc(db, id)?.open_cents ?? 0), 0);
  const { matching_issue: _resolved, ...rest } = c;
  const next: CaseFile = { ...rest, doc_ids: docIds, expected_cents: expected, shortfall_cents: expected - c.received_cents,
    remittance: { trace_id: accepted.trace_id, applications: accepted.allocations }, trace_ids: [...new Set([...c.trace_ids, accepted.trace_id])] };
  db.prepare("UPDATE intent SET case_json = ?, end_condition_json = ? WHERE id = ?")
    .run(JSON.stringify(next), JSON.stringify({ bank_txn_applied: c.bank_txn_id, docs_settled: docIds }), c.intent_id);
  return next;
}

/** Every reading is on the record as a model turn, used or not, so the scoreboard can count what each reader was worth. */
function recordReading(db: Db, clock: Clock, c: CaseFile, r: RemittanceReading, usage?: { tokens_in?: number; tokens_out?: number }): void {
  const id = openDecision(db, clock, { intent_id: c.intent_id, function: c.function, mode: "live", actor: `reader:${r.reader}`, autonomy_level: "shadow", tier: 0 });
  db.prepare(
    `INSERT INTO decision_step (decision_id, step_no, ts, kind, tier, tool, input_json, output_json, tokens_in, tokens_out, latency_ms)
     VALUES (?, 1, ?, 'model_turn', 0, ?, ?, ?, ?, ?, ?)`,
  ).run(id, clock.now(), `reader:${r.reader}`, JSON.stringify({ trace_id: r.trace_id }), JSON.stringify({ outcome: r.outcome, reason: r.reason ?? null }),
    usage?.tokens_in ?? null, usage?.tokens_out ?? null, r.latency_ms);
}
