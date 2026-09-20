import { describe, expect, it } from "vitest";
import type { Db } from "../../runtime/db.js";
import { runControlTests } from "../controls.js";
import type { FindingType } from "../types.js";
import { bareDb, insertPostedDecision } from "./helpers.js";

const INPUT = { period: "2026-07", materiality_cents: 50_000 };
const run = (db: Db, type: FindingType) => runControlTests(db, INPUT).findings.filter((f) => f.type === type);

function approve(db: Db, id: string, decisionId: string, approverId: string, kind = "human"): void {
  db.prepare("INSERT INTO approval (id, decision_id, approver_id, approver_kind, outcome, approved_at) VALUES (?,?,?,?, 'approved','2026-07-16T12:00:00Z')")
    .run(id, decisionId, approverId, kind);
}

describe("control test: duplicate vendors", () => {
  it("finds a name collision through case, punctuation and suffix, and an identical remit-to", () => {
    const db = bareDb();
    db.exec(`INSERT INTO party (id, kind, name, remit_to_json) VALUES
      ('v1','vendor','Acme, Inc.',NULL), ('v2','vendor','ACME  llc',NULL),
      ('v3','vendor','Globex','{"iban":"X1"}'), ('v4','vendor','Initrode','{"iban":"X1"}');`);
    const found = run(db, "duplicate_vendor");
    expect(found).toHaveLength(2);
    expect(found[0]?.refs.party_ids).toEqual(["v1", "v2"]);
    expect(found[1]?.refs.party_ids).toEqual(["v3", "v4"]);
  });

  it("passes distinct vendors with distinct remit details", () => {
    const db = bareDb();
    db.exec(`INSERT INTO party (id, kind, name, remit_to_json) VALUES
      ('v5','vendor','Umbrella Corp','{"iban":"A"}'), ('v6','vendor','Soylent Co','{"iban":"B"}');`);
    expect(run(db, "duplicate_vendor")).toEqual([]);
  });
});

describe("control test: round-number payments", () => {
  it("finds an exact $5,000 outflow and leaves the near misses alone", () => {
    const db = bareDb();
    db.exec(`INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor) VALUES
      ('btx_1','2026-07-10',-500000,'WIRE ACME'),
      ('btx_2','2026-07-11',-400000,'under the floor'),
      ('btx_3','2026-07-12',-512345,'not round'),
      ('btx_4','2026-07-13',500000,'money in, not out'),
      ('btx_5','2026-08-10',-600000,'another period');`);
    const found = run(db, "round_number_payment");
    expect(found).toHaveLength(1);
    expect(found[0]?.refs.bank_txn_id).toBe("btx_1");
  });

  it("passes a period with no round outflows", () => {
    const db = bareDb();
    db.exec("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor) VALUES ('btx_6','2026-07-10',-512345,'ACH');");
    expect(run(db, "round_number_payment")).toEqual([]);
  });
});

describe("control test: entries after the period lock", () => {
  it("finds an entry posted after locked_at", () => {
    const db = bareDb();
    db.exec(`UPDATE period SET status = 'locked', locked_at = '2026-07-31T23:59:00Z' WHERE id = '2026-07';
      INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES
        ('je_late','2026-07','2026-07-30','dec_x','late','2026-08-02T09:00:00Z'),
        ('je_ok','2026-07','2026-07-10','dec_y','in time','2026-07-10T09:00:00Z');`);
    const found = run(db, "post_lock_entry");
    expect(found).toHaveLength(1);
    expect(found[0]?.refs).toMatchObject({ entry_id: "je_late", decision_id: "dec_x", period: "2026-07" });
  });

  it("passes while the period is still open", () => {
    const db = bareDb();
    db.exec("INSERT INTO gl_entry (id, period, date, source_decision_id, memo, posted_at) VALUES ('je_ok','2026-07','2026-07-30','dec_y','ok','2026-08-02T09:00:00Z');");
    expect(run(db, "post_lock_entry")).toEqual([]);
  });
});

describe("control test: self-approval", () => {
  it("finds an approval signed by the preparer and passes one signed by somebody else", () => {
    const db = bareDb();
    insertPostedDecision(db, { id: "dec_s1", amount_cents: 10_000, party_id: "pa", actor: "U_LEE" });
    insertPostedDecision(db, { id: "dec_s2", amount_cents: 10_000, party_id: "pb", actor: "U_LEE" });
    approve(db, "apr_1", "dec_s1", "U_LEE");
    approve(db, "apr_2", "dec_s2", "U_CTRL");
    const found = run(db, "self_approval");
    expect(found).toHaveLength(1);
    expect(found[0]?.refs).toMatchObject({ decision_id: "dec_s1", approver_id: "U_LEE" });
  });
});

describe("control test: just under the line, and split transactions", () => {
  it("finds an amount just under materiality and one just under the approver's limit", () => {
    const db = bareDb();
    db.exec(`INSERT INTO approver (id, name, role, limit_cents) VALUES ('U_LIM','Lim','ap_clerk',100000), ('U_BIG','Big','cfo',1000000);`);
    insertPostedDecision(db, { id: "dec_j1", amount_cents: 48_000, party_id: "pa" });
    insertPostedDecision(db, { id: "dec_j2", amount_cents: 30_000, party_id: "pb" });
    insertPostedDecision(db, { id: "dec_j3", amount_cents: 96_000, party_id: "pc" });
    insertPostedDecision(db, { id: "dec_j4", amount_cents: 60_000, party_id: "pd" });
    approve(db, "apr_3", "dec_j3", "U_LIM");
    approve(db, "apr_4", "dec_j4", "U_BIG");
    const found = run(db, "just_under_threshold");
    expect(found.map((f) => f.refs.decision_id)).toEqual(["dec_j1", "dec_j3"]);
    expect(found[1]?.detail).toContain("just under U_LIM's limit 100000");
  });

  it("finds sub-materiality adjustments to one party that together reach materiality", () => {
    const db = bareDb();
    for (const n of [1, 2, 3]) insertPostedDecision(db, { id: `dec_p${n}`, amount_cents: 20_000, party_id: "p_split" });
    const found = run(db, "split_transaction");
    expect(found).toHaveLength(1);
    expect(found[0]?.refs).toMatchObject({ party_id: "p_split", decision_ids: ["dec_p1", "dec_p2", "dec_p3"] });
    expect(found[0]?.detail).toContain("total 60000 cents");
  });

  it("passes small adjustments that do not add up, and a single large one", () => {
    const db = bareDb();
    insertPostedDecision(db, { id: "dec_q1", amount_cents: 10_000, party_id: "p_ok" });
    insertPostedDecision(db, { id: "dec_q2", amount_cents: 10_000, party_id: "p_ok" });
    insertPostedDecision(db, { id: "dec_q3", amount_cents: 900_000, party_id: "p_one" });
    expect(run(db, "split_transaction")).toEqual([]);
    expect(run(db, "just_under_threshold")).toEqual([]);
  });
});

describe("control test: agent-approved share", () => {
  it("reports the count and share as information, not as a finding", () => {
    const db = bareDb();
    insertPostedDecision(db, { id: "dec_x1", amount_cents: 10_000, party_id: "pa" });
    insertPostedDecision(db, { id: "dec_x2", amount_cents: 10_000, party_id: "pb" });
    approve(db, "apr_5", "dec_x1", "agent:controller", "controller_agent");
    const result = runControlTests(db, INPUT);
    expect(result.agent_approved).toEqual({ posted: 2, agent_approved: 1, share: 0.5 });
    expect(result.findings.map((f) => f.type)).not.toContain("self_approval");
  });
});
