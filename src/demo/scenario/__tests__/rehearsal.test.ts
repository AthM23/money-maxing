import { describe, expect, it } from "vitest";
import { recordHumanAnswer } from "../../../agents/humanLoop.js";
import { buildAuditPack } from "../../../audit/pack.js";
import { rebuildLadder } from "../../../learn/autonomy.js";
import { carryMemory } from "../../../learn/carry.js";
import { approvePolicy, compilePolicies } from "../../../learn/compile.js";
import { harvestLiveOutcomes } from "../../../learn/harvest.js";
import { replay } from "../../../learn/replay.js";
import { scoreboard } from "../../../learn/scoreboard.js";
import { approveFact, factCandidates } from "../../../memory/facts.js";
import { APP_CONFIG } from "../../../packs/index.js";
import type { DocumentReader } from "../../../reader/types.js";
import { approveDecision } from "../../../runtime/approve.js";
import { cloneDb, openDb, type Db } from "../../../runtime/db.js";
import { readControlTotals } from "../../../runtime/kernelContext.js";
import { runOpenIntents } from "../../../worker/runOpenIntents.js";
import { standIn } from "../standIns.js";
import { seedGlobalJuly } from "../world.js";

/** Time moves: a rule approved after an entry posted must be seen to come after it. One second per reading. */
let tick = 0;
const clock = { now: () => new Date(Date.parse("2026-07-22T12:00:00.000Z") + 1000 * tick++).toISOString() };
const deps = { clock, config: APP_CONFIG };

/** Stands in for lane C's fine-tuned reader: the correct reading of Castellan's terse payment advice. */
const reader: DocumentReader = { name: "stand-in reader", read: () => Promise.resolve({ ok: true, latency_ms: 1, doc: {
  doc_kind: "remittance", amount_cents: 849498, applications: [{ invoice: "INV-3182", amount_cents: 300000 }, { invoice: "INV-3183", amount_cents: 549498 }],
  discount_cents: 0, discount_pct: 0, date: "2026-07-18", method: "wire", payer: "Castellan Biotech AG", ref: "RMT76314" } }) };

const status = (db: Db, n: number): string => (db.prepare("SELECT status FROM intent WHERE id = ?").get(`int_g${n}`) as { status: string }).status;
const openCents = (db: Db, id: string): number => (db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(id) as { open_cents: number }).open_cents;
const parked = (db: Db): { id: string; intent_id: string; kind: string }[] =>
  db.prepare("SELECT id, intent_id, kind FROM decision WHERE mode = 'live' AND route = 'PROPOSE' AND posted_at IS NULL ORDER BY rowid").all() as { id: string; intent_id: string; kind: string }[];
const approve = (db: Db, id: string, who: string): string => approveDecision(db, id, { approver_id: who, approver_kind: "human", outcome: "approved" }, deps).status;
const tied = (db: Db): boolean => { const t = readControlTotals(db); return t.ar_gl_cents === t.ar_subledger_cents; };

async function learnFromQ2(db: Db): Promise<void> {
  await replay(db, { investigators: [], function: "ar", clock });
  const [draft] = compilePolicies(db, clock, "ar");
  approvePolicy(db, clock, draft!.policy_id!, "U_CTRL");
  await replay(db, { investigators: [], function: "ar", clock });
  rebuildLadder(db, clock);
}

describe("the global July, end to end at the harness level, with no model call", () => {
  it("Learns, Runs, the 2%, Improves, run 2, and the auditor", async () => {
    const run1 = openDb();
    seedGlobalJuly(run1);
    const cold = cloneDb(run1);
    expect(tied(run1)).toBe(true);

    // LEARNS: the rule comes from how the team booked Q2, scoped to the customers it was seen on.
    await learnFromQ2(run1);
    const rule = run1.prepare("SELECT name, condition_json FROM policy WHERE status = 'approved'").get() as { name: string; condition_json: string };
    expect(rule.name).toBe("SHORT-PAY-01 v1 · wire short ≤ $45.00 → write_off to 6150");
    expect(rule.condition_json).toContain('"ardent","fernhill","ostrander"');

    // RUNS: code alone, plus a document reader for the one remittance nobody could parse.
    await runOpenIntents(run1, { investigators: [], reader, clock, config: APP_CONFIG });
    expect([1, 2, 3, 9].map((n) => status(run1, n))).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    expect(["INV-3111", "INV-3112", "INV-3113", "INV-3121"].map((id) => openCents(run1, id))).toEqual([0, 0, 0, 0]);
    // Castellan: the two invoices the customer named, not the older identical one.
    expect(["INV-3181", "INV-3182", "INV-3183", "INV-3184"].map((id) => openCents(run1, id))).toEqual([300000, 0, 0, 250000]);
    expect(scoreboard(run1)).toMatchObject({ model_calls: 0, documents_read: 1, readings_used: 1 });
    // The duplicate payment is held as unapplied cash for a person; the parent's payment is refused by the kernel.
    expect(parked(run1).map((p) => p.intent_id)).toEqual(["int_g10"]);
    expect(status(run1, 8)).toBe("open");
    expect(openCents(run1, "INV-3171")).toBe(1500000);

    // THE 2%: what code could not settle goes to the judgment tiers (stand-ins here).
    await runOpenIntents(run1, { investigators: [standIn, standIn], clock, config: APP_CONFIG });
    expect(parked(run1).map((p) => `${p.intent_id}:${p.kind}`).sort()).toEqual(["int_g10:apply_payment", "int_g4:write_off", "int_g5:credit_memo", "int_g6:tax_withholding"]);
    expect(status(run1, 7)).toBe("waiting_on_human");
    expect(run1.prepare("SELECT COUNT(*) AS n FROM escalation WHERE answered_at IS NULL").get()).toEqual({ n: 1 });
    expect(factCandidates(run1).map((f) => f.predicate).sort()).toEqual(["concession_pct", "parent_pays", "withholding_tax_pct"]);

    // PEOPLE: approve the entries, approve what is worth remembering, answer the one question.
    for (const p of parked(run1)) expect(approve(run1, p.id, "U_CTRL")).toBe("posted");
    for (const f of factCandidates(run1)) expect(approveFact(run1, clock, f.id, "U_CTRL").status).toBe("active");
    const question = run1.prepare("SELECT id FROM escalation WHERE answered_at IS NULL").get() as { id: string };
    const answered = recordHumanAnswer(run1, question.id, "U_SAM", { treatment: "credit_memo", text: "One-time service credit for the June SSO outage, agreed with their CIO.", uses: "one_time" }, deps);
    expect(answered.status).toBe("answered");
    for (const p of parked(run1)) expect(approve(run1, p.id, "U_CTRL")).toBe("posted");
    // The payer is now confirmed, so Kestrel's case is worth another pass, and code settles it.
    expect(status(run1, 8)).toBe("open");
    await runOpenIntents(run1, { investigators: [], clock, config: APP_CONFIG });
    expect(status(run1, 8)).toBe("resolved");
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => status(run1, n)).filter((s) => s !== "resolved")).toEqual([]);
    expect(tied(run1)).toBe(true);

    // IMPROVES: a person approved a $60 charge, above the rule. The next version covers it; the old one retires.
    harvestLiveOutcomes(run1);
    const v2 = compilePolicies(run1, clock, "ar").find((d) => d.name.startsWith("SHORT-PAY-01 v2"));
    expect(v2?.name).toBe("SHORT-PAY-01 v2 · wire short ≤ $60.00 → write_off to 6150");
    approvePolicy(run1, clock, v2!.policy_id!, "U_CTRL");
    rebuildLadder(run1, clock);

    // RUN 2: the same July from cold, carrying only what was learned. No judgment tier is offered at all.
    carryMemory(run1, cold);
    await runOpenIntents(cold, { investigators: [], reader, clock, config: APP_CONFIG });
    const s2 = scoreboard(cold);
    if (process.env.REHEARSAL_DEBUG) {
      process.stderr.write(`${JSON.stringify(parked(cold))}\n${JSON.stringify(cold.prepare("SELECT function, kind, agree, n, covered, level FROM autonomy").all())}\n${JSON.stringify([1,2,3,4,5,6,7,8,9,10].map((n) => status(cold, n)))}\n`);
    }
    expect(s2).toMatchObject({ model_calls: 0, decided_by_model: 0, questions: 0 });
    // Settled by code this time with nobody involved: the $60 charge (rule v2) and Kestrel (payer confirmed).
    expect([1, 2, 3, 4, 8, 9].map((n) => status(cold, n))).toEqual(["resolved", "resolved", "resolved", "resolved", "resolved", "resolved"]);
    // Prepared by code from what people said in run 1, and parked because each is over $500: Halvorsen's 10%,
    // Meridian's withheld tax, and Brightwater's credit (one-time, but this IS the case it was given for).
    expect(parked(cold).map((p) => `${p.intent_id}:${p.kind}`).sort()).toEqual(["int_g10:apply_payment", "int_g5:credit_memo", "int_g6:tax_withholding", "int_g7:credit_memo"]);
    expect(tied(cold)).toBe(true);

    // DEFENDS: every posted entry re-performs clean; change one character of the CEO's email and that entry is flagged.
    const pack = buildAuditPack(run1, clock, { period: "2026-07", seed: "rehearsal", size: 50 });
    if (process.env.REHEARSAL_DEBUG) process.stderr.write(`AUDIT ${JSON.stringify(pack.reperformance.filter((r) => r.findings.length > 0).map((r) => r.findings))}\nCONTROLS ${JSON.stringify(pack.controls).slice(0, 900)}\n`);
    expect(pack.summary.findings_total).toBe(0);
    run1.prepare("UPDATE trace SET payload_json = replace(payload_json, '10% off', '15% off') WHERE id = 'tr_mail_halvorsen_2'").run();
    const after = buildAuditPack(run1, clock, { period: "2026-07", seed: "rehearsal", size: 50 });
    expect(after.summary.findings_total).toBeGreaterThan(0);
  });
});
