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
import { MAIN_CASES, seedMainScene } from "../mainScene.js";
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
    // The workpapers quote the bank's own labelled lines, not bare numbers.
    const quotes = (db.prepare("SELECT e.value ->> '$.quote' AS q FROM decision d, json_each(json_extract(d.proposal_json, '$.evidence')) e WHERE d.intent_id = 'int_main' AND d.kind IN ('write_off','fx_realized') ORDER BY d.rowid, e.key").all() as { q: string }[]).map((r) => r.q);
    expect(quotes).toEqual(["Bank charges deducted USD 40.00", "Amount received EUR 98,000.00", "Exchange rate applied 1.0800 USD per EUR"]);
  });

  it("a foreign-currency record that does not tie to the bank line cannot drive the arithmetic", async () => {
    const db = await world();
    // EUR 98,000.00 at 1.0800 less 40.00 is the 105,800.00 that arrived. Say the fee was 50.00 and it no longer is.
    db.prepare("UPDATE bank_txn_fx SET fee_cents = 5000 WHERE bank_txn_id = 'BTX-320'").run();
    await runOpenIntents(db, { investigators: [], intent_id: "int_main", clock, config: APP_CONFIG });
    expect(posted(db, "int_main")).not.toContain("fx_realized:196000");
    const marks = db.prepare("SELECT w.marks_json FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = 'int_main' AND d.kind = 'fx_realized'").get() as { marks_json: string } | undefined;
    expect(marks?.marks_json ?? "").toContain("the bank line is 10580000");
  });

  it("realized FX is re-performed, not believed: a wrong amount, a wrong account, a second booking and an uncited advice are all refused", async () => {
    const db = await world();
    const quoted = (amount: string, rate: string) => [{ claim: "the amount the bank received", trace_id: "tr_advice_BTX-320", quote: amount }, { claim: "the rate the bank applied", trace_id: "tr_advice_BTX-320", quote: rate }];
    const fx = (cents: number, account = "7100", evidence: { claim: string; trace_id: string; quote?: string }[] = quoted("Amount received EUR 98,000.00", "Exchange rate applied 1.0800 USD per EUR")) => ({
      intent_id: "int_main", function: "ar" as const, kind: "fx_realized" as const, party_id: "vossberg", entry_date: "2026-07-15", bank_txn_id: "BTX-320",
      applications: [{ doc_id: "INV-3201", amount_cents: cents }],
      entries: [{ account, debit_cents: cents, credit_cents: 0, memo: "fx" }, { account: "1200", debit_cents: 0, credit_cents: cents, memo: "fx" }],
      evidence, policy_refs: [], fact_refs: [], judgment: [] });
    const agent = { actor: "agent:ar:sonnet", mode: "live" as const, autonomy_level: "auto" as const, tier: 2 };
    const failed = (p: ReturnType<typeof fx>): string[] => { const r = proposeEntry(db, p, agent, deps); return r.status === "rejected" ? r.failed.map((m) => m.check) : [r.status]; };
    expect(failed(fx(196000))).toContain("F9");                       // before the cash has been applied to that invoice
    const cash = { ...fx(0), kind: "apply_payment" as const, applications: [{ doc_id: "INV-3201", amount_cents: 10580000 }], evidence: [{ claim: "the bank line", trace_id: "tr_bank_BTX-320" }],
      entries: [{ account: "1000", debit_cents: 10580000, credit_cents: 0, memo: "cash" }, { account: "1200", debit_cents: 0, credit_cents: 10580000, memo: "cash" }] };
    expect(proposeEntry(db, cash, { ...agent, actor: "router:tier0", tier: 0 }, deps).status).toBe("posted");
    // The customer's other EUR invoice would give a different (self-consistent) answer: the rate must come from the invoice this receipt paid.
    expect(failed({ ...fx(196000), applications: [{ doc_id: "INV-3202", amount_cents: 196000 }] })).toContain("F9");
    expect(failed(fx(420000))).toContain("F9");                       // the whole shortfall called FX
    expect(failed(fx(196000, "6990"))).toContain("J4");                // the right amount hidden in misc expense
    expect(failed(fx(196000, "7100", []))).toContain("F9");            // the bank's advice not cited
    expect(failed(fx(196000, "7100", quoted("98,000.00", "1.0800")))).toContain("F9"); // bare numbers: nothing says what they are
    expect(failed(fx(196000, "7100", quoted("Amount received EUR 98,000.00", "USD equivalent 105,840.00")))).toContain("F9"); // the rate is not quoted
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

  it("the euro strengthens instead: a fee and a gain are never netted into a small short-pay, by code or by a model citing the rule", async () => {
    const db = await world();
    // Vossberg pays INV-3202 in full, EUR 25,000.00, at 1.1004 less a USD 25.00 fee: USD 27,485.00 arrives, USD 15.00
    // short of the booked USD 27,500.00. The truth is a 25.00 fee and a 10.00 gain. SHORT-PAY-01 covers a wire 15.00 short.
    const addon = { ...MAIN_CASES[1]!, received_cents: 2748500, shortfall_cents: 1500 };
    db.prepare("UPDATE bank_txn SET amount_cents = 2748500 WHERE id = 'BTX-321'").run();
    db.prepare("UPDATE bank_txn_fx SET foreign_amount_cents = 2500000, rate_ppm = 1100400 WHERE bank_txn_id = 'BTX-321'").run();
    db.prepare("UPDATE intent SET case_json = ? WHERE id = 'int_addon'").run(JSON.stringify(addon));

    await runOpenIntents(db, { investigators: [], intent_id: "int_addon", clock, config: APP_CONFIG });
    expect(posted(db, "int_addon")).toEqual(["apply_payment:2748500"]);
    // Code does not even draft a write-off for it: a converted receipt it cannot split is left to the judgment tiers.
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision WHERE intent_id = 'int_addon' AND kind = 'write_off'").get()).toEqual({ n: 0 });
    expect(open(db, "INV-3202")).toBe(1500);
    expect(status(db, "int_addon")).toBe("open");

    // A model that cites the approved rule for the same net 15.00 is refused by the kernel, in words it can act on.
    const rule = db.prepare("SELECT id FROM policy WHERE status = 'approved' AND function = 'ar'").get() as { id: string };
    const netted = proposeEntry(db, {
      intent_id: "int_addon", function: "ar", kind: "write_off", party_id: "vossberg", entry_date: addon.entry_date,
      applications: [{ doc_id: "INV-3202", amount_cents: 1500 }],
      entries: [{ account: "6150", debit_cents: 1500, credit_cents: 0, memo: "wire short" }, { account: "1200", debit_cents: 0, credit_cents: 1500, memo: "wire short" }],
      evidence: [{ claim: "bank charges on the wire", trace_id: "tr_advice_BTX-321", quote: "Bank charges deducted USD 25.00" }],
      policy_refs: [rule.id], fact_refs: [], judgment: [],
    }, { actor: "agent:ar:haiku", mode: "live", autonomy_level: "auto", tier: 1, features: { shortfall_cents: 1500, method: "wire", party_id: "vossberg" } }, deps);
    expect(netted.status).toBe("rejected");
    const f10 = netted.status === "rejected" ? netted.failed.find((m) => m.check === "F10") : undefined;
    expect(f10?.detail).toContain("a rule can write off the bank's fee (25.00) and nothing else, this entry writes off 15.00");
    expect(open(db, "INV-3202")).toBe(1500);
    expect(tied(db)).toBe(true);
  });

  it("the bank's figures have to be stated whole, and the bank's fee is never booked as a concession to the customer", async () => {
    const db = await world();
    // A concession rule that happens to match a $40 shortfall must not take the fee: the fee goes to a write-off rule or to nobody.
    db.prepare("UPDATE policy SET status = 'retired' WHERE status = 'approved'").run();
    db.prepare(`INSERT INTO policy (id, function, name, condition_json, action_json, intent_text, tier, max_amount_cents, status, approved_by, approved_at)
                VALUES ('pol_concession','ar','small concessions', '{"all":[{"field":"shortfall_cents","op":">","value":0},{"field":"shortfall_cents","op":"<=","value":5000}]}', '{"kind":"credit_memo","account":"2400"}',
                        'small concessions are credited', 'company', 10000000, 'approved', 'U_CTRL', '2026-07-01T00:00:00Z')`).run();
    await runOpenIntents(db, { investigators: [], intent_id: "int_main", clock, config: APP_CONFIG });
    expect(posted(db, "int_main")).toEqual(["apply_payment:10580000", "fx_realized:196000"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision WHERE intent_id = 'int_main' AND kind = 'credit_memo'").get()).toEqual({ n: 0 });

    // "98,000.00" inside "198,000.00" and "1.0800" inside "11.0800" do not state the receipt's amount or rate.
    const other = await world();
    await runOpenIntents(other, { investigators: [], intent_id: "int_addon", clock, config: APP_CONFIG });
    other.prepare("UPDATE trace SET payload_json = replace(replace(payload_json, 'EUR 98,000.00', 'EUR 198,000.00'), '1.0800 USD', '11.0800 USD') WHERE id = 'tr_advice_BTX-320'").run();
    await runOpenIntents(other, { investigators: [], intent_id: "int_main", clock, config: APP_CONFIG });
    expect(posted(other, "int_main")).not.toContain("fx_realized:196000");
    const refused = other.prepare("SELECT w.marks_json FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = 'int_main' AND d.kind = 'fx_realized'").get() as { marks_json: string } | undefined;
    expect(refused?.marks_json ?? "").toContain("does not state 98,000.00");
  });
});
