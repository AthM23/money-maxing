import { describe, expect, it } from "vitest";
import { emit } from "../../bus/bus.js";
import type { Db } from "../../ledger/db.js";
import { JOURNAL_ENTRY_NOT_BUILT, mirrorOnce } from "../mirror.js";
import { creditMemoDocNumber, mirrorRequestId, sourceEmailText, workpaperText } from "../payloads.js";
import { EMAIL_TRACE, FakeQbo, INTENT, QBO_IDS, clock, logRows, openSeeded, postAccrual, postCreditMemo, postPayment, seedManifest, type FakeRequest } from "./fixture.js";

interface RippleRow { kind: string; ref: string; delta_cents: number | null; event_id: number | null; summary: string }
const ripples = (db: Db): RippleRow[] => db.prepare("SELECT kind, ref, delta_cents, event_id, summary FROM ripple WHERE intent_id = ? AND function = 'ar' ORDER BY id").all(INTENT) as RippleRow[];
const qboArtifacts = (db: Db): Array<{ kind: string; external_id: string }> =>
  db.prepare("SELECT kind, external_id FROM artifact WHERE system = 'quickbooks' ORDER BY rowid").all() as Array<{ kind: string; external_id: string }>;
const statuses = (db: Db, id: string): Record<string, string> => Object.fromEntries(logRows(db, id).map((r) => [r.kind, r.status]));
const isCreate = (entity: string, zero?: boolean) => (r: FakeRequest): boolean =>
  r.op === "create" && r.entity === entity && (zero === undefined || (r.body.TotalAmt === 0) === zero);

function seeded(): Db {
  const db = openSeeded();
  seedManifest(db);
  return db;
}

describe("credit memo", () => {
  it("sends CreditMemo, then the zero Payment linking invoice and memo, then the two attachments, in that order", async () => {
    const db = seeded();
    const id = postCreditMemo(db);
    const qbo = new FakeQbo();
    const result = await mirrorOnce(db, { client: qbo }, clock);

    expect(qbo.writes).toEqual([
      { op: "create", entity: "CreditMemo", request_id: mirrorRequestId("CreditMemo", ["CM-INV-1042", QBO_IDS.customer]), body: {
        CustomerRef: { value: QBO_IDS.customer }, TxnDate: "2026-07-14", DocNumber: "CM-INV-1042", PrivateNote: `fn:${id} CEO granted 10% off through renewal`,
        Line: [{ DetailType: "SalesItemLineDetail", Amount: 1200, Description: "Credit against INV-1042", SalesItemLineDetail: { ItemRef: { value: QBO_IDS.item }, Qty: 1, UnitPrice: 1200 } }],
      } },
      { op: "create", entity: "Payment", request_id: mirrorRequestId("CreditApplication", ["CM-INV-1042", QBO_IDS.customer, "900", QBO_IDS.invoice]), body: {
        CustomerRef: { value: QBO_IDS.customer }, TotalAmt: 0, TxnDate: "2026-07-14", PaymentRefNum: "CM-INV-1042", PrivateNote: `fn:${id} credit memo applied`,
        Line: [
          { Amount: 1200, LinkedTxn: [{ TxnId: QBO_IDS.invoice, TxnType: "Invoice" }] },
          { Amount: 1200, LinkedTxn: [{ TxnId: "900", TxnType: "CreditMemo" }] },
        ],
      } },
      { op: "upload", file: { entity_type: "CreditMemo", entity_id: "900", file_name: "workpaper-CM-INV-1042.txt", content_type: "text/plain", content: workpaperText(db, id) } },
      { op: "upload", file: { entity_type: "CreditMemo", entity_id: "900", file_name: `email-${EMAIL_TRACE}.txt`, content_type: "text/plain", content: sourceEmailText(db, EMAIL_TRACE) } },
    ]);
    // each write is preceded by its own look-for-an-existing-one query, on the fields QuickBooks can filter by
    expect(qbo.requests.filter((r) => r.op === "query").map((r) => (r as { sql: string }).sql)).toEqual([
      "select * from CreditMemo where DocNumber = 'CM-INV-1042'",
      `select * from Payment where CustomerRef = '${QBO_IDS.customer}' maxresults 1000`,
      "select * from Attachable where AttachableRef.EntityRef.Type = 'CreditMemo' and AttachableRef.EntityRef.value = '900'",
      "select * from Attachable where AttachableRef.EntityRef.Type = 'CreditMemo' and AttachableRef.EntityRef.value = '900'",
    ]);
    expect(result.events).toBe(2); // entry.posted (ignored for this kind) and ar.credit_memo.posted
    expect(logRows(db, id).map((r) => [r.kind, r.status, r.external_id])).toEqual([
      [`Attachable:email:${EMAIL_TRACE}`, "mirrored", "903"], ["Attachable:workpaper", "mirrored", "902"],
      ["CreditApplication", "mirrored", "901"], ["CreditMemo", "mirrored", "900"],
    ]);
  });

  it("records the ripple on the event's intent, with the memo as a negative delta, and an artifact per object", async () => {
    const db = seeded();
    postCreditMemo(db);
    await mirrorOnce(db, { client: new FakeQbo() }, clock);
    const rows = ripples(db);
    expect(rows.map((r) => [r.kind, r.ref, r.delta_cents])).toEqual([
      ["qbo_credit_memo", "900", -120000], ["qbo_credit_applied", "901", null], ["qbo_attachment", "902", null], ["qbo_attachment", "903", null],
    ]);
    expect(rows.every((r) => typeof r.event_id === "number")).toBe(true);
    expect(qboArtifacts(db)).toEqual([
      { kind: "qbo_credit_memo", external_id: "900" }, { kind: "qbo_credit_applied", external_id: "901" },
      { kind: "qbo_attachment", external_id: "902" }, { kind: "qbo_attachment", external_id: "903" },
    ]);
  });
});

describe("apply_payment", () => {
  it("creates one Payment although the decision arrives on two topics", async () => {
    const db = seeded();
    const id = postPayment(db);
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.requests).toEqual([
      { op: "query", sql: "select * from Payment where PaymentRefNum = 'BTX-0070'" },
      { op: "create", entity: "Payment", request_id: mirrorRequestId("Payment", ["BTX-0070", QBO_IDS.customer]), body: {
        CustomerRef: { value: QBO_IDS.customer }, TotalAmt: 10800, TxnDate: "2026-07-12", PaymentRefNum: "BTX-0070", PrivateNote: `fn:${id}`,
        Line: [{ Amount: 10800, LinkedTxn: [{ TxnId: QBO_IDS.invoice, TxnType: "Invoice" }] }],
      } },
    ]);
    expect(logRows(db, id)).toEqual([{ kind: "Payment", status: "mirrored", external_id: "900", detail: "created" }]);
    expect(ripples(db).map((r) => [r.kind, r.ref])).toEqual([["qbo_payment", "900"]]);
  });
});

describe("other kinds", () => {
  it("are logged as skipped until the JournalEntry mirror exists", async () => {
    const db = seeded();
    const id = postAccrual(db);
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    await mirrorOnce(db, { client: qbo }, clock); // skipped for this reason is final: the sweep leaves it alone
    expect(qbo.requests).toEqual([]);
    expect(logRows(db, id)).toEqual([{ kind: "JournalEntry", status: "skipped", external_id: null, detail: JOURNAL_ENTRY_NOT_BUILT }]);
  });
});

describe("idempotency", () => {
  it("a second pass, and a re-delivered event, send nothing", async () => {
    const db = seeded();
    const payment = postPayment(db);
    const memo = postCreditMemo(db);
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    const sent = qbo.requests.length;
    expect(qbo.writes).toHaveLength(5);

    const second = await mirrorOnce(db, { client: qbo }, clock);
    expect(second).toEqual({ events: 0, retried: 0, steps: [] });

    for (const [topic, id, kind] of [["ar.credit_memo.posted", memo, "credit_memo"], ["ar.payment.applied", payment, "apply_payment"]] as const) {
      emit(db, { topic, from_function: "ar", intent_id: INTENT, payload: { decision_id: id, kind } }, clock);
    }
    const third = await mirrorOnce(db, { client: qbo }, clock);
    expect(third.events).toBe(2);
    expect(third.steps).toEqual([]);
    expect(qbo.requests).toHaveLength(sent);
    expect(ripples(db)).toHaveLength(5);
  });

  it("adopts what is already in QuickBooks: the memo by DocNumber + customer + amount (its own marker first), and QuickBooks' auto-applied link", async () => {
    const db = seeded();
    const id = postCreditMemo(db);
    const qbo = new FakeQbo();
    const memo = { DocNumber: "CM-INV-1042", CustomerRef: { value: QBO_IDS.customer }, TotalAmt: 1200 };
    qbo.answer = (sql) => {
      if (sql.includes("from CreditMemo")) return [{ ...memo, Id: "70", PrivateNote: "fn:dec_someone_else" }, { ...memo, Id: "77", PrivateNote: `fn:${id} CEO granted` }];
      if (sql.includes("from Payment")) return [
        { Id: "80", TotalAmt: 0, Line: [{ LinkedTxn: [{ TxnId: "70", TxnType: "CreditMemo" }] }] },
        { Id: "81", TotalAmt: 0, PrivateNote: "Created by QB Online to link credits to charges.", Line: [{ LinkedTxn: [{ TxnId: "150", TxnType: "Invoice" }] }, { LinkedTxn: [{ TxnId: "77", TxnType: "CreditMemo" }] }] },
      ];
      return [];
    };
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes.map((r) => r.op)).toEqual(["upload", "upload"]);
    const rows = Object.fromEntries(logRows(db, id).map((r) => [r.kind, r]));
    expect(rows.CreditMemo).toMatchObject({ status: "mirrored", external_id: "77", detail: "adopted existing CreditMemo 77" });
    expect(rows.CreditApplication).toMatchObject({ status: "mirrored", external_id: "81", detail: "adopted existing Payment 81" });
  });
});

describe("local reset: QuickBooks keeps the objects, the decision ids are new", () => {
  it("REGRESSION a rerun on a fresh database adopts the Payment, CreditMemo, credit application and files by natural key and creates nothing", async () => {
    const qbo = new FakeQbo().remember();
    const first = seeded();
    const oldIds = [postPayment(first), postCreditMemo(first)];
    await mirrorOnce(first, { client: qbo }, clock);
    expect(qbo.writes).toHaveLength(5);

    const db = seeded(); // the reset: same scenario, new random decision ids, empty mirror_log
    const payment = postPayment(db);
    const memo = postCreditMemo(db);
    expect(oldIds).not.toContain(payment);
    expect(oldIds).not.toContain(memo);
    const rerun = await mirrorOnce(db, { client: qbo }, clock);

    expect(qbo.writes).toHaveLength(5); // nothing new: no second Payment, CreditMemo or zero Payment
    expect(logRows(db, payment)).toEqual([{ kind: "Payment", status: "mirrored", external_id: "900", detail: "adopted existing Payment 900" }]);
    const rows = Object.fromEntries(logRows(db, memo).map((r) => [r.kind, [r.status, r.detail]]));
    expect(rows).toEqual({
      CreditMemo: ["mirrored", "adopted existing CreditMemo 901"], CreditApplication: ["mirrored", "adopted existing Payment 902"],
      "Attachable:workpaper": ["mirrored", "adopted existing Attachable 903"], [`Attachable:email:${EMAIL_TRACE}`]: ["mirrored", "adopted existing Attachable 904"],
    });
    expect(rerun.steps.every((s) => s.status === "mirrored" && s.fresh)).toBe(true);
  });

  it("REGRESSION a natural key held by an object of another amount or customer is never created over: failed, and a repeat is not fresh", async () => {
    const db = seeded();
    const payment = postPayment(db);
    const memo = postCreditMemo(db);
    const qbo = new FakeQbo();
    qbo.answer = (sql) => {
      if (sql.includes("PaymentRefNum = 'BTX-0070'")) return [{ Id: "40", PaymentRefNum: "BTX-0070", CustomerRef: { value: QBO_IDS.customer }, TotalAmt: 10000 }];
      if (sql.includes("from CreditMemo")) return [{ Id: "41", DocNumber: "CM-INV-1042", CustomerRef: { value: "999" }, TotalAmt: 1200 }];
      return [];
    };
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes).toEqual([]);
    expect(logRows(db, payment)).toEqual([{ kind: "Payment", status: "failed", external_id: null, detail: "exists with different amount/customer: 40" }]);
    expect(logRows(db, memo)).toEqual([{ kind: "CreditMemo", status: "failed", external_id: null, detail: "exists with different amount/customer: 41" }]);

    const again = await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes).toEqual([]);
    expect(again.steps.map((s) => [s.kind, s.status, s.fresh])).toEqual([["Payment", "failed", false], ["CreditMemo", "failed", false]]);
  });

  it("REGRESSION a zero Payment that spends this credit memo on a DIFFERENT invoice is not adopted, and nothing is created", async () => {
    const db = seeded();
    const id = postCreditMemo(db);
    const qbo = new FakeQbo();
    qbo.answer = (sql) => {
      if (sql.includes("from CreditMemo")) return [{ Id: "77", DocNumber: "CM-INV-1042", CustomerRef: { value: QBO_IDS.customer }, TotalAmt: 1200 }];
      if (sql.includes("from Payment")) return [{ Id: "82", TotalAmt: 0, Line: [{ LinkedTxn: [{ TxnId: "151", TxnType: "Invoice" }] }, { LinkedTxn: [{ TxnId: "77", TxnType: "CreditMemo" }] }] }];
      return [];
    };
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes.filter((r) => r.op === "create")).toEqual([]);
    const rows = Object.fromEntries(logRows(db, id).map((r) => [r.kind, r]));
    expect(rows.CreditMemo).toMatchObject({ status: "mirrored", external_id: "77" });
    expect(rows.CreditApplication).toMatchObject({ status: "failed", external_id: null, detail: "credit memo 77 is already applied to a different invoice by Payment 82" });
  });

  it("REGRESSION a second credit memo on the same invoice gets CM-<invoice>-2, the same one after a reset, within 21 characters", async () => {
    const numbers = async (): Promise<unknown[]> => {
      const db = seeded();
      postCreditMemo(db);
      postCreditMemo(db);
      const qbo = new FakeQbo();
      await mirrorOnce(db, { client: qbo }, clock);
      return qbo.writes.filter(isCreate("CreditMemo")).map((r) => (r as { body: Record<string, unknown> }).body.DocNumber);
    };
    expect(await numbers()).toEqual(["CM-INV-1042", "CM-INV-1042-2"]);
    expect(await numbers()).toEqual(["CM-INV-1042", "CM-INV-1042-2"]); // fresh database, new decision ids, same numbers
    expect(creditMemoDocNumber("INV-0123456789012345678", 12)).toBe("CM-INV-01234567890-12");
    expect(creditMemoDocNumber("INV-0123456789012345678", 12).length).toBeLessThanOrEqual(21);
  });
});

describe("requestid", () => {
  it("REGRESSION every create carries a requestid derived from the natural key: the same after a reset, different per object, at most 50 hex characters", async () => {
    const ids = async (): Promise<Array<string | undefined>> => {
      const db = seeded();
      postPayment(db);
      postCreditMemo(db);
      const qbo = new FakeQbo();
      await mirrorOnce(db, { client: qbo }, clock);
      return qbo.writes.flatMap((r) => (r.op === "create" ? [r.request_id] : []));
    };
    const first = await ids();
    expect(first).toHaveLength(3);
    for (const id of first) expect(id).toMatch(/^[0-9a-f]{50}$/);
    expect(new Set(first).size).toBe(3);
    expect(await ids()).toEqual(first); // new decision ids, same keys
  });
});

describe("dry run", () => {
  it("writes the bodies to mirror_log and calls nothing, even when handed a client", async () => {
    const db = seeded();
    const id = postCreditMemo(db);
    const qbo = new FakeQbo();
    const result = await mirrorOnce(db, { client: qbo, dry_run: true }, clock);
    expect(qbo.requests).toEqual([]);
    expect(result.steps.map((s) => s.status)).toEqual(["dry_run", "dry_run", "dry_run", "dry_run"]);
    const rows = Object.fromEntries(logRows(db, id).map((r) => [r.kind, r]));
    expect(JSON.parse(rows.CreditMemo!.detail!)).toMatchObject({ DocNumber: "CM-INV-1042", Line: [{ Amount: 1200 }] });
    expect(JSON.parse(rows.CreditApplication!.detail!)).toMatchObject({ TotalAmt: 0, Line: [{ LinkedTxn: [{ TxnId: QBO_IDS.invoice }] }, { LinkedTxn: [{ TxnId: `dry:${id}:CreditMemo`, TxnType: "CreditMemo" }] }] });
    expect(JSON.parse(rows["Attachable:workpaper"]!.detail!)).toEqual({
      file_metadata_01: { AttachableRef: [{ EntityRef: { type: "CreditMemo", value: `dry:${id}:CreditMemo` } }], FileName: "workpaper-CM-INV-1042.txt", ContentType: "text/plain" },
      file_content_01: workpaperText(db, id),
    });
    expect(ripples(db).map((r) => r.ref)).toEqual([`dry:${id}:CreditMemo`, `dry:${id}:CreditApplication`, `dry:${id}:Attachable:workpaper`, `dry:${id}:Attachable:email:${EMAIL_TRACE}`]);
    expect(qboArtifacts(db)).toEqual([]);
  });

  it("no client at all is a dry run too", async () => {
    const db = seeded();
    const id = postPayment(db);
    await mirrorOnce(db, {}, clock);
    expect(statuses(db, id)).toEqual({ Payment: "dry_run" });
  });

  it("then a live run mirrors the same decisions from mirror_log, the events being long consumed", async () => {
    const db = seeded();
    const payment = postPayment(db);
    const memo = postCreditMemo(db);
    await mirrorOnce(db, { dry_run: true }, clock);
    const dryEvent = ripples(db).find((r) => r.kind === "qbo_credit_memo")!.event_id;

    const qbo = new FakeQbo();
    const live = await mirrorOnce(db, { client: qbo }, clock);
    expect(live.events).toBe(0);
    expect(live.retried).toBe(2);
    expect(qbo.writes.map((r) => (r.op === "create" ? r.entity : r.op))).toEqual(["Payment", "CreditMemo", "Payment", "upload", "upload"]);
    expect(Object.values(statuses(db, payment)).concat(Object.values(statuses(db, memo)))).toEqual(Array(5).fill("mirrored"));
    // the zero Payment now carries the real CreditMemo id, not the dry run's placeholder
    expect(qbo.writes[2]).toMatchObject({ body: { TotalAmt: 0, Line: [{}, { LinkedTxn: [{ TxnId: "901", TxnType: "CreditMemo" }] }] } });
    const rows = ripples(db);
    expect(rows.some((r) => r.ref.startsWith("dry:"))).toBe(false);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.kind === "qbo_credit_memo")!.event_id).toBe(dryEvent);
    expect(qboArtifacts(db)).toHaveLength(5);

    const again = await mirrorOnce(db, { client: qbo }, clock);
    expect(again).toEqual({ events: 0, retried: 0, steps: [] });
  });
});

describe("failure and retry", () => {
  it("a failed step is logged, the pass goes on, and only that step is sent again", async () => {
    const db = seeded();
    const memo = postCreditMemo(db);
    const payment = postPayment(db);
    const qbo = new FakeQbo();
    qbo.failWhen = isCreate("Payment", true);
    const first = await mirrorOnce(db, { client: qbo }, clock);
    expect(statuses(db, memo)).toEqual({ CreditMemo: "mirrored", CreditApplication: "failed", "Attachable:workpaper": "mirrored", [`Attachable:email:${EMAIL_TRACE}`]: "mirrored" });
    expect(logRows(db, memo).find((r) => r.kind === "CreditApplication")!.detail).toMatch(/ValidationFault: simulated/);
    expect(statuses(db, payment)).toEqual({ Payment: "mirrored" }); // the later decision was not held up
    expect(first.steps.filter((s) => s.status === "failed")).toHaveLength(1);
    expect(first.steps.every((s) => s.fresh)).toBe(true);

    qbo.failWhen = () => false;
    const before = qbo.writes.length;
    const retry = await mirrorOnce(db, { client: qbo }, clock);
    expect(retry.retried).toBe(1);
    expect(qbo.writes.slice(before)).toMatchObject([{ op: "create", entity: "Payment", body: { TotalAmt: 0 } }]);
    expect(statuses(db, memo).CreditApplication).toBe("mirrored");
    expect(qbo.writes.filter(isCreate("CreditMemo"))).toHaveLength(1);
  });

  it("when the CreditMemo itself fails nothing depending on it is sent, and the retry does all of it", async () => {
    const db = seeded();
    const memo = postCreditMemo(db);
    const qbo = new FakeQbo();
    qbo.failWhen = isCreate("CreditMemo");
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes).toHaveLength(1);
    expect(statuses(db, memo)).toEqual({ CreditMemo: "failed" });
    expect(ripples(db)).toEqual([]);

    qbo.failWhen = () => false;
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes.slice(1).map((r) => (r.op === "create" ? r.entity : r.op))).toEqual(["CreditMemo", "Payment", "upload", "upload"]);
    expect(Object.values(statuses(db, memo))).toEqual(Array(4).fill("mirrored"));
  });

  it("a failed lookup query is a failed step, not a crash", async () => {
    const db = seeded();
    const id = postPayment(db);
    const qbo = new FakeQbo();
    qbo.failWhen = (r) => r.op === "query";
    await expect(mirrorOnce(db, { client: qbo }, clock)).resolves.toMatchObject({ events: 2 });
    expect(statuses(db, id)).toEqual({ Payment: "failed" });
    expect(qbo.writes).toEqual([]);
  });
});

describe("missing mapping", () => {
  it("dry run: skipped, naming what is missing", async () => {
    const db = openSeeded(); // never seeded to QuickBooks
    const id = postCreditMemo(db);
    await mirrorOnce(db, {}, clock);
    const rows = logRows(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "CreditMemo", status: "skipped", external_id: null });
    expect(rows[0]!.detail).toBe("no QuickBooks mapping for customer initech, invoice INV-1042, item Platform subscription: seed_manifest has no 'quickbooks' row (run pnpm seed --target=quickbooks)");
  });

  it("live: skipped when QuickBooks does not have the records either, with no write", async () => {
    const db = openSeeded();
    const id = postPayment(db);
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes).toEqual([]);
    expect(statuses(db, id)).toEqual({ Payment: "skipped" });
    // retried on the next live pass, but a repeat of the same outcome is not reported as fresh work
    const again = await mirrorOnce(db, { client: qbo }, clock);
    expect(again.retried).toBe(1);
    expect(again.steps.map((s) => [s.status, s.fresh])).toEqual([["skipped", false]]);
  });

  it("live: a mapping that turns up later is picked up (by natural key, recorded in seed_manifest) and the skipped decision is mirrored", async () => {
    const db = openSeeded();
    const id = postPayment(db);
    await mirrorOnce(db, {}, clock);
    expect(statuses(db, id)).toEqual({ Payment: "skipped" });

    const qbo = new FakeQbo();
    qbo.answer = (sql) => {
      if (sql === "select * from Customer where DisplayName = 'Initech'") return [{ Id: QBO_IDS.customer }];
      if (sql === "select * from Invoice where DocNumber = 'INV-1042'") return [{ Id: QBO_IDS.invoice }];
      return [];
    };
    await mirrorOnce(db, { client: qbo }, clock);
    expect(qbo.writes).toMatchObject([{ op: "create", entity: "Payment", body: { CustomerRef: { value: QBO_IDS.customer }, Line: [{ LinkedTxn: [{ TxnId: QBO_IDS.invoice }] }] } }]);
    expect(statuses(db, id)).toEqual({ Payment: "mirrored" });
    expect(db.prepare("SELECT world_id, kind, external_id FROM seed_manifest WHERE system = 'quickbooks' ORDER BY world_id").all()).toEqual([
      { world_id: "INV-1042", kind: "invoice", external_id: QBO_IDS.invoice }, { world_id: "initech", kind: "customer", external_id: QBO_IDS.customer },
    ]);
  });
});
