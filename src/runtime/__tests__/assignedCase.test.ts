import { describe, expect, it } from "vitest";
import type { Investigator } from "../../agents/investigator.js";
import { runCase } from "../../agents/runCase.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import { APP_CONFIG } from "../../packs/index.js";
import type { Db } from "../db.js";
import { fixedClock, seedInitech } from "./seed.js";

/**
 * Found by an outside review on 20 Sep and reproduced before it was fixed: an agent working Initech's $30 wire case
 * cited the rule learned on Initech (wire short up to $45) and auto-posted a $450 write-off on WAYNE's invoice. The
 * rule's condition was tested on the features of the case the agent was assigned, not on the entry it proposed.
 */
function world(): Db {
  const db = seedInitech();
  db.prepare(`INSERT INTO policy (id,function,name,condition_json,action_json,intent_text,tier,status,code,version,approved_by,approved_at,max_amount_cents)
    VALUES ('pol_sp1','ar','SHORT-PAY-01 v1',?,?,'learned','company','approved','SHORT-PAY-01',1,'U_CTRL','2026-07-01T00:00:00Z',1000000)`)
    .run(JSON.stringify({ all: [{ field: "shortfall_cents", op: ">", value: 0 }, { field: "shortfall_cents", op: "<=", value: 4500 }, { field: "method", op: "==", value: "wire" }, { field: "party_id", op: "in", value: ["initech"] }] }),
      JSON.stringify({ kind: "write_off", account: ACCOUNTS.bank_charges }));
  db.prepare("INSERT INTO autonomy (function, kind, agree, n, covered, level, updated_at) VALUES ('ar','write_off',5,5,1,'auto','2026-07-01T00:00:00Z')").run();
  db.exec("UPDATE bank_txn SET amount_cents = 1197000, method = 'wire' WHERE id = 'BTX-1';");
  return db;
}

const assigned = { intent_id: "int_1", function: "ar", party_id: "initech", entry_date: "2026-07-12", bank_txn_id: "BTX-1", doc_ids: ["INV-1042"],
  expected_cents: 1200000, received_cents: 1197000, shortfall_cents: 3000, method: "wire", trace_ids: [], matching_issue: "held for the model tier in this test" };

const writeOff = (intentId: string, party: string, doc: string, cents: number): Record<string, unknown> => ({
  intent_id: intentId, function: "ar", kind: "write_off", party_id: party, entry_date: "2026-07-12", applications: [{ doc_id: doc, amount_cents: cents }],
  entries: [{ account: ACCOUNTS.bank_charges, debit_cents: cents, credit_cents: 0, memo: "bank fee" }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: cents, memo: "bank fee" }],
  evidence: [{ claim: "bank line", trace_id: "tr_email_1" }], policy_refs: ["pol_sp1"], fact_refs: [], judgment: [],
});

const openCents = (db: Db, id: string): number => (db.prepare("SELECT open_cents FROM invoice WHERE id = ?").get(id) as { open_cents: number }).open_cents;
const run = (db: Db, agent: Investigator) => runCase(db, assigned, { mode: "live", autonomy_level: "earned", investigators: [agent], clock: fixedClock, config: APP_CONFIG });

describe("an agent works the case it was assigned, and a customer's rule covers that customer's entry only", () => {
  it("a rule learned on one customer cannot cover another customer's invoice, however the agent's own case looks", async () => {
    const db = world();
    const before = openCents(db, "INV-1050");
    let answer: unknown;
    await run(db, { name: "scripted", async investigate(_t, call) { answer = call("propose_entry", writeOff("int_1", "wayne", "INV-1050", 45000)).output; return { outcome: "proposed", summary: "", places_looked: [] }; } });
    expect(answer).toMatchObject({ status: "rejected" });
    const j1 = (answer as { failed: { check: string; detail: string }[] }).failed.find((m) => m.check === "J1");
    expect(j1?.detail).toContain("condition does not hold");
    expect(j1?.detail).toContain("the entry adjusts 45000, the cited rule was tested on a shortfall of 3000");
    expect(openCents(db, "INV-1050")).toBe(before);
  });

  it("the same rule still covers the assigned customer's own $30, and nothing more than the shortfall it was tested on", async () => {
    const db = world();
    let tooMuch: unknown;
    let exact: unknown;
    await run(db, { name: "scripted", async investigate(_t, call) {
      tooMuch = call("propose_entry", writeOff("int_1", "initech", "INV-1042", 4500)).output;
      exact = call("propose_entry", writeOff("int_1", "initech", "INV-1042", 3000)).output;
      return { outcome: "proposed", summary: "", places_looked: [] };
    } });
    expect(tooMuch).toMatchObject({ status: "rejected" });
    expect((exact as { status: string }).status).not.toBe("rejected");
  });

  it("an entry under somebody else's case is refused before the kernel is even asked", async () => {
    const db = world();
    db.exec("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_other','ar','another case','ar','open','2026-07-12T09:00:00Z');");
    const before = openCents(db, "INV-1042");
    let answer: unknown;
    await run(db, { name: "scripted", async investigate(_t, call) { answer = call("propose_entry", writeOff("int_other", "initech", "INV-1042", 3000)).output; return { outcome: "proposed", summary: "", places_looked: [] }; } });
    expect(JSON.stringify(answer)).toContain("you were assigned int_1");
    expect((db.prepare("SELECT COUNT(*) AS n FROM decision WHERE intent_id = 'int_other'").get() as { n: number }).n).toBe(0);
    expect(openCents(db, "INV-1042")).toBe(before);
  });
});
