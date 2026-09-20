import { describe, expect, it } from "vitest";
import { recordHumanAnswer } from "../../../agents/humanLoop.js";
import { buildAuditPack } from "../../../audit/pack.js";
import { rebuildLadder } from "../../../learn/autonomy.js";
import { approvePolicy, compilePolicies } from "../../../learn/compile.js";
import { replay } from "../../../learn/replay.js";
import { applicableFacts } from "../../../memory/applicability.js";
import { APP_CONFIG } from "../../../packs/index.js";
import { approveDecision } from "../../../runtime/approve.js";
import { openDb, type Db } from "../../../runtime/db.js";
import { readControlTotals } from "../../../runtime/kernelContext.js";
import { proposeEntry } from "../../../runtime/proposeEntry.js";
import { runOpenIntents } from "../../../worker/runOpenIntents.js";
import { seedMainScene } from "../mainScene.js";
import { standIn } from "../standIns.js";
import { seedGlobalJuly } from "../world.js";

let tick = 0;
const clock = { now: () => new Date(Date.parse("2026-07-23T12:00:00.000Z") + 1000 * tick++).toISOString() };
const deps = { clock, config: APP_CONFIG };
const open = (db: Db, id: string): number => (db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(id) as { open_cents: number }).open_cents;
const status = (db: Db, id: string): string => (db.prepare("SELECT status FROM intent WHERE id = ?").get(id) as { status: string }).status;
const posted = (db: Db, intent: string): string[] => (db.prepare("SELECT kind || ':' || (SELECT SUM(a.value ->> '$.amount_cents') FROM json_each(json_extract(proposal_json, '$.applications')) a) AS k FROM decision WHERE intent_id = ? AND posted_at IS NOT NULL ORDER BY rowid").all(intent) as { k: string }[]).map((r) => r.k);
const parked = (db: Db): { id: string; intent_id: string; kind: string }[] => db.prepare("SELECT id, intent_id, kind FROM decision WHERE mode = 'live' AND route = 'PROPOSE' AND posted_at IS NULL ORDER BY rowid").all() as { id: string; intent_id: string; kind: string }[];
const tied = (db: Db): boolean => { const t = readControlTotals(db); return t.ar_gl_cents === t.ar_subledger_cents; };

async function world(): Promise<Db> {
  const db = openDb();
  seedGlobalJuly(db);
  seedMainScene(db);
  await replay(db, { investigators: [], function: "ar", clock });
  const [draft] = compilePolicies(db, clock, "ar");
  approvePolicy(db, clock, draft!.policy_id!, "U_CTRL");
  await replay(db, { investigators: [], function: "ar", clock });
  rebuildLadder(db, clock);
  return db;
}

describe("the main scene: one wire, $4,200 short for three reasons, and only one of them needs a person", () => {
  it("code books the cash, the bank's fee and the rate difference; only what the customer held back is left", async () => {
    const db = await world();
    expect(tied(db)).toBe(true);
    await runOpenIntents(db, { investigators: [], intent_id: "int_main", clock, config: APP_CONFIG });
    expect(posted(db, "int_main")).toEqual(["apply_payment:10580000", "write_off:4000", "fx_realized:196000"]);
    expect(open(db, "INV-3201")).toBe(220000);
    expect(status(db, "int_main")).toBe("open");
    expect(db.prepare("SELECT COALESCE(SUM(model_calls), 0) AS n FROM decision").get()).toEqual({ n: 0 });
    const lines = db.prepare("SELECT l.account, l.debit_cents FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id JOIN decision d ON d.id = e.source_decision_id WHERE d.intent_id = 'int_main' AND l.debit_cents > 0 ORDER BY l.rowid").all();
    expect(lines).toEqual([{ account: "1000", debit_cents: 10580000 }, { account: "6150", debit_cents: 4000 }, { account: "7100", debit_cents: 196000 }]);
    expect(tied(db)).toBe(true);
  });

  it("realized FX is re-performed, not believed: a wrong amount, a wrong account, a second booking and an uncited advice are all refused", async () => {
    const db = await world();
    const fx = (cents: number, account = "7100", evidence = [{ claim: "the bank's credit advice", trace_id: "tr_advice_BTX-320" }]) => ({
      intent_id: "int_main", function: "ar" as const, kind: "fx_realized" as const, party_id: "vossberg", entry_date: "2026-07-15", bank_txn_id: "BTX-320",
      applications: [{ doc_id: "INV-3201", amount_cents: cents }],
      entries: [{ account, debit_cents: cents, credit_cents: 0, memo: "fx" }, { account: "1200", debit_cents: 0, credit_cents: cents, memo: "fx" }],
      evidence, policy_refs: [], fact_refs: [], judgment: [] });
    const agent = { actor: "agent:ar:sonnet", mode: "live" as const, autonomy_level: "auto" as const, tier: 2 };
    const failed = (p: ReturnType<typeof fx>): string[] => { const r = proposeEntry(db, p, agent, deps); return r.status === "rejected" ? r.failed.map((m) => m.check) : [r.status]; };
    expect(failed(fx(420000))).toContain("F9");                       // the whole shortfall called FX
    expect(failed(fx(196000, "6990"))).toContain("J4");                // the right amount hidden in misc expense
    expect(failed(fx(196000, "7100", []))).toContain("F9");            // the bank's advice not cited
    expect(proposeEntry(db, fx(196000), agent, deps).status).toBe("posted");
    expect(failed({ ...fx(196000), entry_date: "2026-07-16" })).toContain("F9"); // a second booking for the same receipt
  });

  it("asked once, answered as a standing 2% with an end date; the add-on invoice a week later is covered without asking", async () => {
    const db = await world();
    await runOpenIntents(db, { investigators: [standIn, standIn], function: "ar", clock, config: APP_CONFIG });
    expect(posted(db, "int_addon")).toEqual(["apply_payment:2668000", "write_off:2500", "fx_realized:24500"]);
    const questions = db.prepare("SELECT e.id FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE d.intent_id IN ('int_main','int_addon')").all() as { id: string }[];
    expect(questions).toHaveLength(1);

    const answered = recordHumanAnswer(db, questions[0]!.id, "U_CFO", { treatment: "credit_memo", uses: "standing", pct_off: 2, valid_to: "2026-09-30",
      text: "Agreed with their ops director: a 2% SLA credit for the June outage on invoices for June to September service. Approved, Avery (CFO)." }, deps);
    expect(answered).toMatchObject({ status: "answered", fact_status: "active" });
    for (const p of parked(db).filter((x) => x.intent_id === "int_main")) expect(approveDecision(db, p.id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps).status).toBe("posted");
    expect(open(db, "INV-3201")).toBe(0);
    expect(status(db, "int_main")).toBe("resolved");

    // The add-on invoice: the same 2%, a different amount. Code prepares the credit from the remembered answer; nobody is asked.
    expect(status(db, "int_addon")).toBe("open");
    await runOpenIntents(db, { investigators: [], intent_id: "int_addon", clock, config: APP_CONFIG });
    const addon = parked(db).filter((x) => x.intent_id === "int_addon");
    expect(addon.map((p) => p.kind)).toEqual(["credit_memo"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM escalation").get()).toEqual({ n: 3 - 1 }); // Brightwater's and Vossberg's: no third
    expect(approveDecision(db, addon[0]!.id, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps).status).toBe("posted");
    expect(open(db, "INV-3202")).toBe(0);

    // Out of scope: the answer was about Vossberg. Another customer citing "the outage" gets nothing from it.
    expect(applicableFacts(db, { party_id: "brightwater", kind: "credit_memo", entry_date: "2026-07-16", amount_cents: 330000 }).applicable).toEqual([]);

    // Identical replay: running again posts nothing twice and asks nothing twice.
    const before = db.prepare("SELECT COUNT(*) AS n FROM decision").get() as { n: number };
    await runOpenIntents(db, { investigators: [standIn], intent_id: "int_main", retry: true, clock, config: APP_CONFIG });
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision").get()).toEqual(before);
    expect(tied(db)).toBe(true);

    // The auditor re-performs every posted entry, the FX ones included.
    expect(buildAuditPack(db, clock, { period: "2026-07", seed: "main", size: 50 }).summary.findings_total).toBe(0);
  });
});
