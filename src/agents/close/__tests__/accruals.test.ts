import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../../contract/accounts.js";
import type { Proposal } from "../../../contract/types.js";
import { seedPayablesSide } from "../../../demo/scenario/payables.js";
import { seedGlobalJuly } from "../../../demo/scenario/world.js";
import { APP_CONFIG } from "../../../packs/index.js";
import { approveDecision } from "../../../runtime/approve.js";
import { openDb, type Db } from "../../../runtime/db.js";
import { readControlTotals } from "../../../runtime/kernelContext.js";
import { proposeEntry } from "../../../runtime/proposeEntry.js";
import { runOpenIntents } from "../../../worker/runOpenIntents.js";
import { openAccrualCases, unbilledExpenses } from "../accruals.js";

let tick = 0;
const clock = { now: () => new Date(Date.parse("2026-07-31T20:00:00.000Z") + 1000 * tick++).toISOString() };
const deps = { clock, config: APP_CONFIG };

function world(): Db {
  const db = openDb();
  seedGlobalJuly(db);
  expect(seedPayablesSide(db).status).toBe("seeded");
  return db;
}

const accrual = (db: Db, party: string): { id: string; route: string | null; posted_at: string | null; proposal_json: string } | undefined =>
  db.prepare("SELECT d.id, d.route, d.posted_at, d.proposal_json FROM decision d WHERE d.kind = 'accrual' AND json_extract(d.proposal_json, '$.party_id') = ? ORDER BY d.rowid DESC LIMIT 1").get(party) as never;
const marks = (db: Db, decisionId: string): { check: string; status: string; detail: string }[] =>
  (JSON.parse((db.prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1").get(decisionId) as { marks_json: string }).marks_json) as { marks: { check: string; status: string; detail: string }[] }).marks;

function byHand(db: Db, intentId: string, party: string, account: string, cents: number, evidence: Proposal["evidence"]): ReturnType<typeof proposeEntry> {
  return proposeEntry(db, { intent_id: intentId, function: "close", kind: "accrual", party_id: party, entry_date: "2026-07-31", applications: [], reversal_mode: "auto_next_period",
    entries: [{ account, debit_cents: cents, credit_cents: 0, memo: "accrue" }, { account: ACCOUNTS.accrued_liabilities, debit_cents: 0, credit_cents: cents, memo: "accrue" }],
    evidence, policy_refs: [], fact_refs: [], judgment: [{ note: "no bill yet", confidence: "medium" }] }, { actor: "agent:close:haiku", mode: "live", autonomy_level: "earned", tier: 1 }, deps);
}

describe("accruals: an expense nobody has billed yet is found from the ledger, estimated only when it is steady, and re-performed by the kernel", () => {
  it("the payables side keeps the books tied and gives the close two things to account for", () => {
    const db = world();
    const t = readControlTotals(db);
    // Every seeded bill is paid, so payables nets to nothing on both sides.
    expect([Math.abs(t.ap_gl_cents), Math.abs(t.ap_subledger_cents), t.ar_gl_cents === t.ar_subledger_cents]).toEqual([0, 0, true]);
    expect(unbilledExpenses(db, "2026-07").map((u) => [u.party, u.account, u.steady, u.estimate_cents])).toEqual([
      ["Castlegate Property Trust", "6400", true, 1_400_000], ["Harborline Cloud", "5000", false, 1_895_475]]);
    expect(unbilledExpenses(db, "2026-06")).toEqual([]); // June was billed: nothing to accrue
  });

  it("a steady expense is accrued at its median by code, parked for a person, and posts on approval; a moving one is never averaged", async () => {
    const db = world();
    expect(openAccrualCases(db, clock, "2026-07")).toHaveLength(2);
    expect(openAccrualCases(db, clock, "2026-07")).toEqual([]); // asked once
    await runOpenIntents(db, { investigators: [], config: APP_CONFIG, function: "close", clock });

    const rent = accrual(db, "castlegate")!;
    expect(rent.route).toBe("PROPOSE");
    expect(marks(db, rent.id).find((m) => m.check === "F11")).toMatchObject({ status: "pass" });
    expect(marks(db, rent.id).find((m) => m.check === "F11")!.detail).toContain("median 14,000.00, nothing booked for 2026-07");
    expect(accrual(db, "harborline")).toBeUndefined();

    expect(approveDecision(db, rent.id, { approver_id: "U_CFO", approver_kind: "human", outcome: "approved" }, deps).status).toBe("posted");
    const lines = db.prepare("SELECT l.account, l.debit_cents, l.credit_cents FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE e.source_decision_id = ? ORDER BY l.line_no").all(rent.id);
    expect(lines).toEqual([{ account: "6400", debit_cents: 1_400_000, credit_cents: 0 }, { account: "2200", debit_cents: 0, credit_cents: 1_400_000 }]);
    expect(unbilledExpenses(db, "2026-07").map((u) => u.party_id)).toEqual(["harborline"]);
  });

  it("the kernel refuses an accrual twice, an accrual that is a number from nowhere, and one for a vendor with no history", async () => {
    const db = world();
    const [rentCase, hostingCase] = openAccrualCases(db, clock, "2026-07");
    await runOpenIntents(db, { investigators: [], config: APP_CONFIG, function: "close", clock });
    approveDecision(db, accrual(db, "castlegate")!.id, { approver_id: "U_CFO", approver_kind: "human", outcome: "approved" }, deps);

    const twice = byHand(db, rentCase!, "castlegate", "6400", 1_400_000, []);
    expect(twice.status === "rejected" ? twice.failed.map((m) => m.detail).join(" ") : twice.status).toContain("it would be counted twice");
    const guessed = byHand(db, hostingCase!, "harborline", "5000", 1_900_000, []);
    expect(guessed.status === "rejected" ? guessed.failed.map((m) => m.detail).join(" ") : guessed.status).toContain("neither the median of the last three months");
    const stranger = byHand(db, hostingCase!, "vossberg", "5000", 1_900_000, []);
    expect(stranger.status).toBe("rejected");
  });

  it("a moving expense can be accrued at the figure the vendor put in writing, and then a person reads that document", async () => {
    const db = world();
    const hostingCase = openAccrualCases(db, clock, "2026-07").at(-1)!;
    const stated = byHand(db, hostingCase, "harborline", "5000", 2_148_000, [{ claim: "Harborline's July usage statement", trace_id: "tr_gmail_hlc_july_usage", quote: "Estimated charges for the period: USD 21,480.00" }]);
    expect(stated.status).toBe("pending_approval");
    const f11 = marks(db, stated.status === "pending_approval" ? stated.decision_id : "").find((m) => m.check === "F11")!;
    expect(f11.status).toBe("judgment");
    expect(f11.detail).toContain("a figure harborline stated in a cited document");
    // The same figure quoted from somebody else's document is not the vendor's word.
    const borrowed = byHand(db, hostingCase, "harborline", "5000", 1_400_000, [{ claim: "rent", trace_id: "tr_gmail_bill_CPT-2606", quote: "Amount due: USD 14,000.00" }]);
    expect(borrowed.status).toBe("rejected");
  });
});
