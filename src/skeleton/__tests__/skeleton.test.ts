import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { poll } from "../../bus/bus.js";
import { bankFile, localConnectors, parseBankCsv } from "../../connectors/local.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import { CaseFile, HumanOutcome } from "../../contract/types.js";
import { runInvoiceVsCash } from "../../drift/invoiceVsCash.js";
import { ingest, ingestAll } from "../../ingest/ingest.js";
import { traceId } from "../../ingest/ids.js";
import { buildResolver } from "../../ingest/resolve.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { bankUnmatched, getInvoice, openInvoices, trialBalance } from "../../ledger/read.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { generateWorld } from "../../seed/generate.js";
import { seedLocal, writeStores } from "../../seed/local.js";
import { runSkeleton, type SkeletonRow } from "../run.js";

const { world, answerKey } = generateWorld();
const key = (plant: string, party: string) => answerKey.find((k) => k.plant === plant && k.party_id === party)!;

function seeded(): { db: Db; dir: string } {
  const db = openWorldDb();
  seedLocal(db, world);
  const dir = mkdtempSync(join(tmpdir(), "footnote-stores-"));
  writeStores(world, dir);
  return { db, dir };
}

describe("world file", () => {
  it("is a pure function of the seed", () => {
    expect(JSON.stringify(generateWorld(7).world)).toBe(JSON.stringify(generateWorld(7).world));
    expect(JSON.stringify(generateWorld(7).world)).not.toBe(JSON.stringify(generateWorld(8).world));
  });

  it("has 12 customers plus the Globex parent, 10 vendors, and the spec's Initech numbers", () => {
    expect(world.parties.filter((p) => p.kind === "customer")).toHaveLength(13);
    expect(world.parties.filter((p) => p.kind === "vendor")).toHaveLength(10);
    const inv = world.invoices.find((i) => i.id === "INV-1042")!;
    expect(inv).toMatchObject({ party_id: "initech", issue_date: "2026-07-01", total_cents: 1_200_000 });
    const paid = world.bank.txns.find((t) => t.id === key("initech_ceo_concession", "initech").bank_txn_id)!;
    expect(paid).toMatchObject({ posted_date: "2026-07-12", amount_cents: 1_080_000 });
    expect(world.mail.find((m) => m.id === "m-initech-2")!.body).toContain("Initech gets 10% off the platform fee through renewal on 2027-06-30");
  });

  it("says nothing anywhere that explains Wayne's $3,300", () => {
    const text = JSON.stringify([world.mail, world.chat, world.crm.notes]).toLowerCase();
    expect(text).not.toMatch(/wayne[^"]*(discount|credit|concession|short|3,300)/);
  });

  it("the committed world file matches the generator", () => {
    expect(JSON.parse(readFileSync("world/northwind.json", "utf8"))).toEqual(JSON.parse(JSON.stringify(world)));
  });
});

describe("local seeder", () => {
  it("ties AR and AP to the GL before any proposal runs (kernel F3), and the books foot", () => {
    const { db } = seeded();
    const c = readControlTotals(db);
    expect(c.ar_gl_cents).toBe(c.ar_subledger_cents);
    expect(c.ar_gl_cents).toBe(world.invoices.filter((i) => i.issue_date === "2026-07-01").reduce((n, i) => n + i.total_cents, 0));
    expect(c.ap_gl_cents === c.ap_subledger_cents).toBe(true);
    const tb = trialBalance(db);
    expect(tb.reduce((n, r) => n + r.balance_cents, 0)).toBe(0);
    // Q2 cash in the GL equals the bank's running balance at 30 June
    const juneClose = world.bank.txns.filter((t) => t.posted_date <= "2026-06-30").reduce((n, t) => n + t.amount_cents, 0);
    expect(trialBalance(db, "2026-06-30").find((r) => r.account === ACCOUNTS.cash)!.balance_cents).toBe(juneClose);
  });

  it("refuses to seed twice, and writes approvers including the controller agent's ceiling", () => {
    const { db } = seeded();
    expect(() => seedLocal(db, world)).toThrow(/already seeded/);
    expect(db.prepare("SELECT limit_cents FROM approver WHERE id = 'controller:gpt'").get()).toEqual({ limit_cents: 49_999 });
    expect(db.prepare("SELECT owner_user FROM party WHERE id = 'wayne'").get()).toEqual({ owner_user: "U_SAM" });
  });

  it("writes Q2 decision points replay can use: a valid CaseFile, a hidden HumanOutcome, one human inconsistency", () => {
    const { db } = seeded();
    const rows = db.prepare("SELECT case_json, human_outcome_json FROM decision_point ORDER BY decided_at").all() as { case_json: string; human_outcome_json: string }[];
    expect(rows).toHaveLength(6);
    for (const r of rows) CaseFile.parse(JSON.parse(r.case_json));
    const accounts = rows.map((r) => HumanOutcome.parse(JSON.parse(r.human_outcome_json)).account);
    expect(accounts.filter((a) => a === ACCOUNTS.bank_charges)).toHaveLength(5);
    expect(accounts.filter((a) => a === ACCOUNTS.misc_expense)).toHaveLength(1);
  });
});

describe("ingestion", () => {
  it("is idempotent on (source, external_id), keeps three clocks apart, and resolves parties from aliases", async () => {
    const { db, dir } = seeded();
    const first = await ingestAll(db, localConnectors(dir));
    expect(first["bank-file"]).toMatchObject({ committed: world.bank.txns.length, bank_txns: world.bank.txns.length, unchanged: 0 });
    const traces = (db.prepare("SELECT COUNT(*) AS n FROM trace").get() as { n: number }).n;
    const again = await ingestAll(db, localConnectors(dir));
    expect(again["bank-file"]).toMatchObject({ committed: 0, unchanged: world.bank.txns.length });
    expect((db.prepare("SELECT COUNT(*) AS n FROM trace").get() as { n: number }).n).toBe(traces);

    const email = db.prepare("SELECT * FROM trace WHERE id = ?").get(traceId("gmail", "m-initech-2")) as { recorded_time: string; ingested_at: string; party_id: string; content_hash: string };
    expect(email.recorded_time).toBe("2026-06-28T15:00:00Z");
    expect(email.ingested_at > "2026-09-01").toBe(true);
    expect(email.party_id).toBe("initech");
    expect(email.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // the parent's descriptor resolves to the parent, not the subsidiary it pays for
    expect(db.prepare("SELECT party_id FROM bank_txn WHERE id = ?").get(key("parent_pays_for_subsidiary", "globex-labs").bank_txn_id)).toEqual({ party_id: "globex-holdings" });
    // every contract row points at a trace that now exists
    expect(db.prepare("SELECT COUNT(*) AS n FROM contract c WHERE NOT EXISTS (SELECT 1 FROM trace t WHERE t.id = c.trace_id)").get()).toEqual({ n: 0 });
  });

  it("changed content becomes version 2 and announces itself; the old version stays", () => {
    const { db } = seeded();
    const item = { source: "gmail" as const, kind: "email", external_id: "m-x", event_time: "2026-07-02T10:00:00Z", recorded_time: "2026-07-02T10:00:00Z", payload: { body: "net 30" } };
    ingest(db, [item]);
    expect(ingest(db, [{ ...item, payload: { body: "net 45" } }])).toMatchObject({ reversioned: 1, committed: 0 });
    expect(db.prepare("SELECT id, version FROM trace WHERE external_id = 'm-x' ORDER BY version").all()).toEqual([{ id: "tr_gmail_m_x", version: 1 }, { id: "tr_gmail_m_x_v2", version: 2 }]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM event WHERE topic = 'evidence.reversioned'").get()).toEqual({ n: 1 });
  });

  it("refuses a malformed bank file whole: split amount, broken running balance", async () => {
    const header = "external_id,posted_date,amount,descriptor,method,recorded_time,running_balance";
    expect(() => parseBankCsv(`${header}\nB1,2026-07-01,1,240.00,ACH X,ach,2026-07-01T10:00:00Z,1240.00`)).toThrow(/8 fields/);
    expect(() => parseBankCsv(`${header}\nB1,2026-07-01,10.00,ACH X,ach,2026-07-01T10:00:00Z,10.00\nB2,2026-07-02,5.00,ACH Y,ach,2026-07-02T10:00:00Z,16.00`)).toThrow(/running balance/);
    expect(() => parseBankCsv(`${header}\nB1,2026-07-01,10.5,ACH X,ach,2026-07-01T10:00:00Z,10.50`)).toThrow(/two places/);

    const { db, dir } = seeded();
    const path = join(dir, "bank", "operating.csv");
    writeFileSync(path, readFileSync(path, "utf8").replace(/\n(BTX-0002,[^\n]*),(\d+\.\d\d)\n/, "\n$1,1.00\n"));
    const out = await ingestAll(db, [bankFile(dir)]);
    expect(out["bank-file"]).toHaveProperty("error");
    expect(db.prepare("SELECT COUNT(*) AS n FROM bank_txn").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM event WHERE topic = 'ingest.refused'").get()).toEqual({ n: 1 });
  });

  it("resolves only what an alias supports", () => {
    const { db } = seeded();
    const r = buildResolver(db);
    expect(r.resolve({ text: "ACH CREDIT INITECH LLC INV-1042" })).toBe("initech");
    expect(r.resolve({ emails: ["sam.okafor@northwind.test", "lucius.f@wayne.test"] })).toBe("wayne");
    expect(r.resolve({ text: "ACH CREDIT INITECHNOLOGIES" })).toBeNull();
    expect(r.resolve({ emails: ["statements@firstharbor.test"] })).toBeNull();
  });
});

describe("walking skeleton: bank line → drift → intent → router → propose_entry → kernel → ledger", () => {
  let db: Db;
  let rows: SkeletonRow[];
  const row = (bankTxnId: string | undefined) => rows.find((r) => r.bank_txn_id === bankTxnId)!;
  const unsettled = (intentId: string) => (db.prepare("SELECT COUNT(*) AS n FROM decision WHERE intent_id = ? AND actor = 'router:unsettled'").get(intentId) as { n: number }).n;

  beforeAll(async () => {
    const s = seeded();
    db = s.db;
    rows = await runSkeleton(db, { stores_dir: s.dir });
  });

  it("opens one intent per unmatched July credit, each with a valid CaseFile", () => {
    expect(rows).toHaveLength(11); // 12 customers, Umbrella has not paid
    for (const r of rows) CaseFile.parse(JSON.parse((db.prepare("SELECT case_json FROM intent WHERE id = ?").get(r.intent_id) as { case_json: string }).case_json));
  });

  it("a clean payment posts AUTO at tier 0 with no model call, settles its invoice and closes its intent", () => {
    const acme = world.bank.txns.find((t) => t.descriptor.startsWith("ACH CREDIT ACME CORP") && t.posted_date.startsWith("2026-07"))!;
    const r = row(acme.id);
    expect(r).toMatchObject({ routes: ["AUTO"], final_route: "AUTO", tier: 0, intent_status: "resolved" });
    expect(getInvoice(db, "INV-1037")).toMatchObject({ open_cents: 0, status: "paid", applications: [{ kind: "apply_payment", amount_cents: 850_000, bank_txn_id: acme.id }] });
    const d = db.prepare("SELECT model_calls, posted_at, actor FROM decision WHERE intent_id = ?").get(r.intent_id) as { model_calls: number; posted_at: string | null; actor: string };
    expect(d).toMatchObject({ model_calls: 0, actor: "router:tier0" });
    expect(d.posted_at).not.toBeNull();
    const wp = db.prepare("SELECT kernel_verdict FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = ?").get(r.intent_id);
    expect(wp).toEqual({ kernel_verdict: "accept" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM event WHERE topic = 'ar.payment.applied' AND intent_id = ?").get(r.intent_id)).toEqual({ n: 1 });
  });

  it("a clean payment with no invoice number on the bank line is still matched, on payer and amount", () => {
    const hooli = world.bank.txns.find((t) => t.descriptor === "ACH CREDIT HOOLI INC PAYMENT")!;
    expect(row(hooli.id)).toMatchObject({ final_route: "AUTO", intent_status: "resolved" });
  });

  it("Initech and Wayne: the cash is applied, the shortfall is left for judgment, and the intent waits on a person", () => {
    for (const [plant, party, inv, short] of [["initech_ceo_concession", "initech", "INV-1042", 120_000], ["wayne_unexplained_short_pay", "wayne", "INV-1048", 330_000]] as const) {
      const r = row(key(plant, party).bank_txn_id);
      // Cash applied is not case resolved: with no model tier, what code cannot settle goes to a person, on the record.
      expect(r.intent_status).toBe("waiting_on_human");
      expect(unsettled(r.intent_id)).toBe(1);
      expect(r.question).toContain("shortfall");
      expect(openInvoices(db, party)).toMatchObject([{ id: inv, open_cents: short }]);
    }
  });

  it("the parent's payment is not applied to the subsidiary on a guess: the kernel rejects it", () => {
    const r = row(key("parent_pays_for_subsidiary", "globex-labs").bank_txn_id);
    expect(r).toMatchObject({ routes: [], final_route: null, intent_status: "waiting_on_human" });
    // The rejected proposal is the record of why; nothing posted, so no separate "unsettled" note is needed.
    expect(db.prepare("SELECT w.kernel_verdict, d.posted_at FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = ?").all(r.intent_id)).toEqual([{ kernel_verdict: "reject", posted_at: null }]);
    expect(unsettled(r.intent_id)).toBe(0);
    expect(openInvoices(db, "globex-labs")).toMatchObject([{ id: "INV-1038", open_cents: 1_500_000 }]);
    expect(bankUnmatched(db).map((t) => t.id)).toEqual([r.bank_txn_id]);
  });

  it("leaves the books tied and footed, and bank cash equal to GL cash plus the one unapplied line", () => {
    const c = readControlTotals(db);
    expect(c.ar_gl_cents).toBe(c.ar_subledger_cents);
    expect(trialBalance(db).reduce((n, r) => n + r.balance_cents, 0)).toBe(0);
    const bank = world.bank.txns.reduce((n, t) => n + t.amount_cents, 0);
    const glCash = trialBalance(db).find((r) => r.account === ACCOUNTS.cash)!.balance_cents;
    expect(bank - glCash).toBe(bankUnmatched(db).reduce((n, t) => n + t.unapplied_cents, 0));
  });

  it("a second sync opens nothing new and posts nothing twice", async () => {
    const entries = (db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n;
    const intents = (db.prepare("SELECT COUNT(*) AS n FROM intent").get() as { n: number }).n;
    expect(runInvoiceVsCash(db).every((f) => !f.opened)).toBe(true);
    expect(await poll(db, "ar-dispatch", ["bankrec.unmatched"], () => { throw new Error("nothing should be dispatched"); })).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM gl_entry").get() as { n: number }).n).toBe(entries);
    expect((db.prepare("SELECT COUNT(*) AS n FROM intent").get() as { n: number }).n).toBe(intents);
  });
});
