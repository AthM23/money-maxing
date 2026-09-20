import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BANK_HEADER_WIDE, convert, localConnectors, parseBankCsv } from "../../connectors/local.js";
import { ACCOUNTS } from "../../contract/accounts.js";
import { CaseFile } from "../../contract/types.js";
import { Q2_WIRE_FEES } from "../../demo/scenario/documents.js";
import { ADVICE_320, MAIN_CASES } from "../../demo/scenario/mainScene.js";
import { CASES } from "../../demo/scenario/plants.js";
import { runInvoiceVsCash } from "../../drift/invoiceVsCash.js";
import { traceId } from "../../ingest/ids.js";
import { ingestAll } from "../../ingest/ingest.js";
import { openWorldDb, type Db } from "../../ledger/db.js";
import { trialBalance } from "../../ledger/read.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { generateGlobalJuly, VOSSBERG_OUTAGE_SLACK, VOSSBERG_SECTION_7 } from "../globalJuly.js";
import { seedLocal, writeStores } from "../local.js";
import { World } from "../world.js";

const { world, answerKey } = generateGlobalJuly();

function seeded(): { db: Db; dir: string } {
  const db = openWorldDb();
  seedLocal(db, world);
  const dir = mkdtempSync(join(tmpdir(), "footnote-global-july-"));
  writeStores(world, dir);
  return { db, dir };
}

describe("the global July world", () => {
  it("is deterministic, and the committed file is what the generator writes", () => {
    expect(JSON.stringify(generateGlobalJuly().world)).toBe(JSON.stringify(world));
    const committed = World.parse(JSON.parse(readFileSync("world/global-july.json", "utf8")));
    expect(JSON.stringify(committed)).toBe(JSON.stringify(world));
  });

  it("has the Gate 1 numbers: EUR 100,000 booked at 1.1000, EUR 98,000 received at 1.0800 less USD 40.00", () => {
    const inv = world.invoices.find((i) => i.id === "INV-3201")!;
    expect(inv).toMatchObject({ party_id: "vossberg", issue_date: "2026-06-15", due_date: "2026-07-15", total_cents: 11_000_000, service_from: "2026-07", fx: { currency: "EUR", foreign_total_cents: 10_000_000, booked_rate_ppm: 1_100_000 } });
    const txn = world.bank.txns.find((t) => t.id === "BTX-320")!;
    expect(txn).toMatchObject({ amount_cents: 10_580_000, fx: { currency: "EUR", foreign_amount_cents: 9_800_000, rate_ppm: 1_080_000, fee_cents: 4_000 } });
    const key = answerKey.find((k) => k.bank_txn_id === "BTX-320")!;
    expect(key.shortfall_cents).toBe(420_000);
    expect(key.causes).toEqual({ fx_loss_cents: 196_000, bank_fee_cents: 4_000, withheld_cents: 220_000 });
    expect(answerKey.find((k) => k.bank_txn_id === "BTX-321")).toMatchObject({ shortfall_cents: 82_000, causes: { fx_loss_cents: 24_500, bank_fee_cents: 2_500, withheld_cents: 55_000 } });
  });

  it("every multi-cause shortfall in the answer key is the sum of its causes", () => {
    for (const k of answerKey.filter((x) => x.causes)) {
      expect(k.causes!.fx_loss_cents + k.causes!.bank_fee_cents + k.causes!.withheld_cents).toBe(k.shortfall_cents);
    }
  });

  it("the bank's advice states every number lane A's advice states, in the words the kernel and the router quote", () => {
    const advice = world.mail.find((m) => m.id === "gj-m-advice-BTX-320")!.body;
    const numbers = ADVICE_320.match(/\d[\d,]*\.\d{2,4}/g)!;
    expect(numbers).toEqual(expect.arrayContaining(["98,000.00", "1.0800", "105,840.00", "40.00", "105,800.00"]));
    for (const n of numbers) expect(advice, n).toContain(n);
    const avis = world.mail.find((m) => m.id === "gj-m-avis-BTX-320")!.body;
    for (const words of ["INV-3201", "100,000.00", "2,000.00", "98,000.00", "NW-48213"]) expect(avis).toContain(words);
  });

  it("the evidence proves the outage and the request, and that nobody with authority agreed", () => {
    expect(world.chat.map((c) => c.text)).toContain(VOSSBERG_OUTAGE_SLACK);
    expect(world.chat.map((c) => c.text).join("\n")).toContain("Nothing is approved for Vossberg yet");
    expect(world.mail.find((m) => m.id === "gj-m-vossberg-2")!.body).toContain("I cannot confirm a credit myself");
    const orderForm = world.contracts.find((c) => c.id === "CTR-vossberg-2025")!.text;
    expect(orderForm).toContain(VOSSBERG_SECTION_7);
    expect(orderForm).toContain("payable in full without set-off or deduction");
  });

  it("lane A's policy memo survives word for word inside the sections", () => {
    const memo = world.files[0]!.sections.map((s) => s.text).join(" ");
    expect(memo).toContain("Tax deducted at source by a customer under local law is not a discount and not an expense");
    expect(memo).toContain("written off to bank charges (6150) only under an approved rule; otherwise ask.");
  });
});

describe("seeded books", () => {
  let db: Db;
  let dir: string;
  beforeAll(async () => {
    ({ db, dir } = seeded());
    const results = await ingestAll(db, localConnectors(dir));
    for (const [name, r] of Object.entries(results)) expect(r, name).not.toHaveProperty("error");
  });

  it("tie before any agent runs: AR control = open invoices, the trial balance foots, cash = the four bank balances", () => {
    const c = readControlTotals(db);
    expect(c.ar_gl_cents).toBe(c.ar_subledger_cents);
    const tb = trialBalance(db);
    expect(tb.reduce((n, r) => n + r.debit_cents, 0)).toBe(tb.reduce((n, r) => n + r.credit_cents, 0));
    const matched = db.prepare("SELECT COALESCE(SUM(b.amount_cents), 0) AS n FROM bank_txn b JOIN bank_match_seed s ON s.bank_txn_id = b.id").get() as { n: number };
    expect(tb.find((r) => r.account === ACCOUNTS.cash)!.balance_cents).toBe(matched.n);
  });

  it("writes the FX contract rows lane A's kernel reads, with the advice trace already ingested", () => {
    expect(db.prepare("SELECT * FROM invoice_fx WHERE invoice_id LIKE 'INV-32%' ORDER BY invoice_id").all()).toEqual([
      { invoice_id: "INV-3201", currency: "EUR", foreign_total_cents: 10_000_000, booked_rate_ppm: 1_100_000 },
      { invoice_id: "INV-3202", currency: "EUR", foreign_total_cents: 2_500_000, booked_rate_ppm: 1_100_000 },
    ]);
    const fx = db.prepare("SELECT * FROM bank_txn_fx WHERE bank_txn_id = 'BTX-320'").get() as { advice_trace_id: string };
    expect(fx).toEqual({ bank_txn_id: "BTX-320", currency: "EUR", foreign_amount_cents: 9_800_000, rate_ppm: 1_080_000, fee_cents: 4_000, advice_trace_id: traceId("gmail", "gj-m-advice-BTX-320") });
    const advice = db.prepare("SELECT party_id, payload_json FROM trace WHERE id = ?").get(fx.advice_trace_id) as { party_id: string; payload_json: string };
    // The bank wrote it, to treasury: it is company mail, filed under no customer. The bank line points at it instead.
    expect(advice.party_id).toBeNull();
    expect(advice.payload_json).toContain("1.0800");
  });

  it("books the closed months' euro receipts as the team did: cash, the bank's fee, and the rate going either way", () => {
    const lines = (posted: string): unknown[] => db.prepare(
      "SELECT l.account, l.debit_cents, l.credit_cents FROM gl_line l JOIN bank_match_seed s ON s.entry_id = l.entry_id JOIN bank_txn b ON b.id = s.bank_txn_id JOIN bank_txn_fx f ON f.bank_txn_id = b.id WHERE b.posted_date = ? ORDER BY l.line_no",
    ).all(posted);
    // April: EUR 25,000 booked at 1.0800 (27,000.00), paid at 1.0840 less 40.00: a gain of 100.00
    expect(lines("2026-04-16")).toEqual([
      { account: "1000", debit_cents: 2_706_000, credit_cents: 0 }, { account: "6150", debit_cents: 4_000, credit_cents: 0 },
      { account: "7100", debit_cents: 0, credit_cents: 10_000 }, { account: "1200", debit_cents: 0, credit_cents: 2_700_000 },
    ]);
    // May: booked at 1.0900 (27,250.00), paid at 1.0860 less 40.00: a loss of 100.00
    expect(lines("2026-05-18")).toContainEqual({ account: "7100", debit_cents: 10_000, credit_cents: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM invoice WHERE party_id = 'vossberg' AND open_cents = 0").get()).toEqual({ n: 3 });
  });

  it("remeasures the open euro invoice at 30 June and reverses it on 1 July, so July starts from the booked rate", () => {
    const unrealized = (asOf: string): number => trialBalance(db, asOf).find((r) => r.account === "7150")?.balance_cents ?? 0;
    expect(unrealized("2026-06-30")).toBe(100_000);
    expect(unrealized("2026-07-01")).toBe(0);
    // invoiced on 15 June for the third quarter: nothing of it was recognised in June
    expect(db.prepare("SELECT COUNT(*) AS n FROM gl_entry WHERE id = 'je_seed_rev_INV-3201'").get()).toEqual({ n: 0 });
  });

  it("labels every bank line with its account and entity, and resolves every payer from the descriptor alone", () => {
    const rows = db.prepare("SELECT b.id, b.party_id, l.account_id, l.entity_id FROM bank_txn b LEFT JOIN bank_txn_label l ON l.bank_txn_id = b.id WHERE b.id != 'BTX-200'").all() as Array<{ id: string; party_id: string | null; account_id: string | null; entity_id: string | null }>;
    expect(rows.filter((r) => !r.party_id || !r.account_id || !r.entity_id)).toEqual([]);
    expect(rows.find((r) => r.id === "BTX-308")!.party_id).toBe("kestrel-group");
    expect(rows.find((r) => r.id === "BTX-306")).toMatchObject({ account_id: "dbs_sg", entity_id: "pte" });
  });

  it("files mail and chat under the right customer, so an agent's search by party finds them", () => {
    const party = (id: string): string | null => (db.prepare("SELECT party_id FROM trace WHERE id = ?").get(id) as { party_id: string | null }).party_id;
    expect(party(traceId("gmail", "gj-m-avis-BTX-320"))).toBe("vossberg");
    expect(party(traceId("gmail", "gj-m-vossberg-2"))).toBe("vossberg");
    expect(party(traceId("slack", "gj-c-11"))).toBe("vossberg");
    expect(party(traceId("gmail", "gj-m-halvorsen-2"))).toBe("halvorsen");
  });

  it("the Q2 decision points are lane A's six plus Vossberg's three incoming-wire fees, all inside the wire-fee rule's range", () => {
    const points = db.prepare("SELECT case_json, human_outcome_json FROM decision_point").all() as Array<{ case_json: string; human_outcome_json: string }>;
    const got = points.map((p) => ({ party_id: CaseFile.parse(JSON.parse(p.case_json)).party_id, ...(JSON.parse(p.human_outcome_json) as { account: string; amount_cents: number }) }));
    for (const f of Q2_WIRE_FEES) expect(got).toContainEqual(expect.objectContaining({ party_id: f.party_id, amount_cents: f.cents, account: f.account }));
    const vossberg = got.filter((g) => g.party_id === "vossberg");
    expect(vossberg.map((g) => g.amount_cents).sort()).toEqual([3500, 4000, 4000]);
    expect(vossberg.every((g) => g.account === ACCOUNTS.bank_charges)).toBe(true);
    expect(points).toHaveLength(9);
  });

  it("the drift monitor opens lane A's ten cases and its two main-scene cases, field for field, by its own rules", () => {
    const findings = runInvoiceVsCash(db);
    expect(findings).toHaveLength(12);
    const byTxn = new Map(findings.map((f) => [f.bank_txn_id, f.case_file]));
    for (const want of [...CASES, ...MAIN_CASES]) {
      const got = byTxn.get(want.bank_txn_id!)!;
      expect({ ...got, intent_id: "", trace_ids: [] }, want.bank_txn_id).toEqual({ ...want, intent_id: "", trace_ids: [] });
    }
    // Case 9 must stay undecided, or the document reader's beat disappears.
    expect(byTxn.get("BTX-309")!.doc_ids).toEqual([]);
    expect(byTxn.get("BTX-320")!.trace_ids).toEqual([traceId("bank", "BTX-320"), traceId("gmail", "gj-m-advice-BTX-320")]);
    expect(runInvoiceVsCash(db).filter((f) => f.opened)).toHaveLength(0);
  });

  it("a second ingest of the same stores changes nothing", async () => {
    const again = await ingestAll(db, localConnectors(dir));
    for (const r of Object.values(again)) expect(r).toMatchObject({ committed: 0, reversioned: 0, bank_txns: 0 });
  });
});

describe("the wide bank file", () => {
  const row = (fields: string): string => `${BANK_HEADER_WIDE}\n${fields}\n`;
  const usdLine = "B-1,2026-07-15,100.00,ACH CREDIT X,ach,2026-07-15T10:00:00Z,100.00,jpm_operating,inc,USD,,,,";

  it("reads a converted receipt and checks the bank's own arithmetic", () => {
    const [item] = parseBankCsv(row("B-1,2026-07-15,105800.00,WIRE X,wire,2026-07-15T10:00:00Z,105800.00,jpm_operating,inc,EUR,98000.00,1.0800,40.00,m-1"));
    expect(item!.bank_txn).toMatchObject({ amount_cents: 10_580_000, label: { account_id: "jpm_operating", entity_id: "inc", currency: "EUR" }, fx: { foreign_amount_cents: 9_800_000, rate_ppm: 1_080_000, fee_cents: 4_000, advice_ref: "m-1" } });
  });

  it("refuses the whole file when the conversion does not tie to the cent, or a USD line carries conversion fields", () => {
    expect(() => parseBankCsv(row("B-1,2026-07-15,105800.01,WIRE X,wire,2026-07-15T10:00:00Z,105800.01,jpm_operating,inc,EUR,98000.00,1.0800,40.00,m-1"))).toThrow(/conversion does not tie/);
    expect(() => parseBankCsv(row("B-1,2026-07-15,105800.00,WIRE X,wire,2026-07-15T10:00:00Z,105800.00,jpm_operating,inc,EUR,98000.00,1.08,40.00,m-1"))).toThrow(/fx_rate/);
    expect(() => parseBankCsv(row(usdLine.replace("USD,,,,", "USD,1.00,,,")))).toThrow(/USD but carries conversion/);
    expect(parseBankCsv(row(usdLine))[0]!.bank_txn!.fx).toBeUndefined();
  });

  it("still reads the narrow file the Northwind world writes", () => {
    const narrow = "external_id,posted_date,amount,descriptor,method,recorded_time,running_balance\nB-1,2026-07-15,100.00,ACH CREDIT X,ach,2026-07-15T10:00:00Z,100.00\n";
    expect(parseBankCsv(narrow)[0]!.bank_txn).toEqual({ id: "B-1", posted_date: "2026-07-15", amount_cents: 10_000, descriptor: "ACH CREDIT X", method: "ach" });
  });

  it("rounds a conversion half up in integers", () => {
    expect(convert(1_470_000, 1_085_000)).toBe(1_594_950);
    expect(convert(1, 1_500_000)).toBe(2);
  });

  it("refuses a bank line that appears in two account files", async () => {
    const { dir } = seeded();
    const path = join(dir, "bank", "dbs_sg.csv");
    const other = readFileSync(join(dir, "bank", "hsbc_uk.csv"), "utf8").split("\n")[1]!;
    const dup = other.split(",");
    writeFileSync(path, `${BANK_HEADER_WIDE}\n${[...dup.slice(0, 6), dup[2], "dbs_sg", "pte", ...dup.slice(9)].join(",")}\n`);
    const result = await ingestAll(openWorldDbSeeded(), localConnectors(dir));
    expect(result["bank-file"]).toHaveProperty("error");
  });
});

function openWorldDbSeeded(): Db {
  const db = openWorldDb();
  seedLocal(db, world);
  return db;
}
