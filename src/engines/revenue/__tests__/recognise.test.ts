import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "../../../contract/accounts.js";
import { traceId } from "../../../ingest/ids.js";
import type { Db } from "../../../ledger/db.js";
import { approveDecision } from "../../../runtime/approve.js";
import { deferredTieOut, recogniseMonth } from "../recognise.js";
import { revenueOnce } from "../revise.js";
import { ensureSchedules, recognisedPeriods, recognisedStatus } from "../store.js";
import { clock, count, INITECH, postInitechMemo, seededWorld } from "./helpers.js";

const TERMS = { pct_off: 10, until: "2027-06-30" };
/** Priya (U_CTRL) signs up to $10,000; Initech's $10,800 needs the CFO. Measured, see the OVER_APPROVER_LIMIT test. */
const CFO = { approver_id: "U_CFO", approver_kind: "human" as const, outcome: "approved" as const };

async function concededWorld(): Promise<{ db: Db; intent_id: string }> {
  const db = await seededWorld();
  const memo = postInitechMemo(db, { terms_change: TERMS });
  await revenueOnce(db, clock);
  return { db, intent_id: memo.intent_id };
}

describe("recogniseMonth", () => {
  it("July: one intent, one proposal per active contract, Initech at the revised $10,800, all parked as PROPOSE (above materiality)", async () => {
    const { db } = await concededWorld();
    const run = recogniseMonth(db, "2026-07", { clock });
    expect(run.intent_id).toBe("int_rev_2026-07");
    expect(db.prepare("SELECT function, owner, question FROM intent WHERE id = 'int_rev_2026-07'").get())
      .toEqual({ function: "revenue", owner: "revenue", question: "Recognise 2026-07 subscription revenue per schedule" });
    expect(run.lines).toHaveLength(12); // 13 contracts; CTR-initech-2025 ended in June
    expect(run.lines.every((l) => l.status === "pending_approval")).toBe(true);
    const initech = run.lines.find((l) => l.contract_id === INITECH)!;
    expect(initech).toMatchObject({ amount_cents: 1_080_000, schedule_version: 2, party_id: "initech" });
    expect(db.prepare("SELECT route, actor, kind, posted_at FROM decision WHERE id = ?").get(initech.decision_id))
      .toEqual({ route: "PROPOSE", actor: "engine:revenue", kind: "rev_recognition", posted_at: null });
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_recognition")).toBe(12);
    expect(recognisedStatus(db, INITECH, "2026-07")).toBe("pending");
    expect(recognisedPeriods(db, INITECH).has("2026-07")).toBe(false); // parked is not recognised
    // nothing reached the ledger yet
    expect(count(db, "SELECT COUNT(*) AS n FROM gl_line WHERE account = ? AND credit_cents > 0 AND entry_id IN (SELECT id FROM gl_entry WHERE period = '2026-07')", ACCOUNTS.subscription_revenue)).toBe(0);
  });

  it("the proposal is Dr 2400 / Cr 4000 at month end, and cites the contract trace because ingestion put it there", async () => {
    const { db } = await concededWorld();
    const initech = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    const proposal = JSON.parse((db.prepare("SELECT proposal_json FROM decision WHERE id = ?").get(initech.decision_id) as { proposal_json: string }).proposal_json) as Record<string, unknown>;
    expect(proposal).toMatchObject({
      function: "revenue", kind: "rev_recognition", party_id: "initech", entry_date: "2026-07-31", applications: [],
      entries: [
        { account: "2400", debit_cents: 1_080_000, credit_cents: 0, memo: "Revenue 2026-07 CTR-initech-2026 per schedule v2" },
        { account: "4000", debit_cents: 0, credit_cents: 1_080_000, memo: "Revenue 2026-07 CTR-initech-2026 per schedule v2" },
      ],
      evidence: [{ trace_id: traceId("contract", INITECH) }],
    });
  });

  it("after a human approves, the entry is in the ledger, the status reads posted, and Initech's deferred revenue ties to zero", async () => {
    const { db, intent_id } = await concededWorld();
    let initech = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(deferredTieOut(db, "2026-07").rows.find((r) => r.party_id === "initech")).toMatchObject({ gl_deferred_cents: 1_080_000, expected_cents: 0, tied: false });

    // kernel behaviour, measured: the controller's $10,000 limit blocks a $10,800 entry even after she clicks approve
    expect(approveDecision(db, initech.decision_id!, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock }))
      .toMatchObject({ status: "blocked", rule: "OVER_APPROVER_LIMIT" });
    // ...and a BLOCK is terminal for that decision: the CFO cannot approve it afterwards. The engine proposes afresh.
    expect(recognisedStatus(db, INITECH, "2026-07")).toBe("blocked");
    expect(approveDecision(db, initech.decision_id!, CFO, { clock })).toMatchObject({ status: "not_pending" });
    const blockedId = initech.decision_id;
    initech = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(initech).toMatchObject({ status: "pending_approval", amount_cents: 1_080_000 });
    expect(initech.decision_id).not.toBe(blockedId);
    expect(approveDecision(db, initech.decision_id!, CFO, { clock })).toMatchObject({ status: "posted" });

    expect(recognisedStatus(db, INITECH, "2026-07")).toBe("posted");
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_recognition WHERE contract_id = ?", INITECH)).toBe(1);
    expect(recognisedPeriods(db, INITECH).has("2026-07")).toBe(true);
    const lines = db.prepare("SELECT l.account, l.debit_cents, l.credit_cents, e.date FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE e.source_decision_id = ? ORDER BY l.line_no").all(initech.decision_id);
    expect(lines).toEqual([
      { account: "2400", debit_cents: 1_080_000, credit_cents: 0, date: "2026-07-31" },
      { account: "4000", debit_cents: 0, credit_cents: 1_080_000, date: "2026-07-31" },
    ]);
    expect(deferredTieOut(db, "2026-07").rows.find((r) => r.party_id === "initech")).toEqual({
      party_id: "initech", billed_cents: 4_800_000, credit_memo_cents: 120_000, scheduled_cents: 4_680_000, expected_cents: 0, gl_deferred_cents: 0, diff_cents: 0, tied: true,
    });
    // the concession reduced July revenue ONCE: $10,800 recognised, nothing in 4900
    const july = db.prepare("SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS n FROM gl_line l JOIN gl_entry e ON e.id = l.entry_id WHERE l.party_id = 'initech' AND e.period = '2026-07' AND l.account IN ('4000','4900')").get();
    expect(july).toEqual({ n: 1_080_000 });

    // and the recognition shows up in the ripple of the intent that caused the concession
    expect(db.prepare("SELECT function, kind, ref, before_cents, after_cents, delta_cents FROM ripple WHERE intent_id = ? AND kind = 'rev_recognition'").all(intent_id))
      .toEqual([{ function: "revenue", kind: "rev_recognition", ref: `${INITECH}:2026-07`, before_cents: 1_200_000, after_cents: 1_080_000, delta_cents: -120_000 }]);
    expect(db.prepare("SELECT decision_id, system FROM artifact WHERE intent_id = ? AND kind = 'rev_recognition' AND unwound_at IS NULL").all(intent_id)).toEqual([{ decision_id: initech.decision_id, system: "ledger" }]);
  });

  it("re-running recognises nothing twice, before or after approval", async () => {
    const { db } = await concededWorld();
    const first = recogniseMonth(db, "2026-07", { clock });
    const decisions = count(db, "SELECT COUNT(*) AS n FROM decision");
    const second = recogniseMonth(db, "2026-07", { clock });
    expect(second.lines.every((l) => l.status === "skipped" && l.reason === "already_pending")).toBe(true);
    for (const l of first.lines) expect(approveDecision(db, l.decision_id!, CFO, { clock }).status).toBe("posted");
    const third = recogniseMonth(db, "2026-07", { clock });
    expect(third.lines.every((l) => l.status === "skipped" && l.reason === "already_recognised")).toBe(true);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision")).toBe(decisions);
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_recognition")).toBe(12);
    expect(count(db, "SELECT COUNT(*) AS n FROM gl_entry WHERE period = '2026-07' AND memo LIKE 'Revenue 2026-07%'")).toBe(12);
    const tie = deferredTieOut(db, "2026-07");
    expect(tie.rows.filter((r) => !r.tied)).toEqual([]);
    expect(tie.total).toMatchObject({ party_id: "TOTAL", gl_deferred_cents: 0, expected_cents: 0, tied: true });
  });

  it("a small amount posts AUTO with no approval, and status reads posted straight away", async () => {
    const db = await seededWorld();
    db.prepare("UPDATE contract SET value_cents = 480000 WHERE id = 'CTR-pied-piper-2026'").run(); // $400 a month, under the $500 materiality line
    const line = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === "CTR-pied-piper-2026")!;
    expect(line).toMatchObject({ status: "posted", amount_cents: 40_000 });
    expect(recognisedStatus(db, "CTR-pied-piper-2026", "2026-07")).toBe("posted");
    expect(count(db, "SELECT COUNT(*) AS n FROM event WHERE topic = 'rev.recognised'")).toBe(1);
  });

  it("never recognises what was not billed: with the world in August and no August invoices, every line is skipped as exceeds_deferred once July is out", async () => {
    const { db } = await concededWorld();
    for (const l of recogniseMonth(db, "2026-07", { clock }).lines) approveDecision(db, l.decision_id!, CFO, { clock });
    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor) VALUES ('BTX-AUG', '2026-08-31', 100, 'INTEREST')").run(); // the world reaches August
    const august = recogniseMonth(db, "2026-08", { clock });
    expect(august.lines).toHaveLength(12);
    expect(august.lines.every((l) => l.status === "skipped" && l.reason === "exceeds_deferred")).toBe(true);
    expect(count(db, "SELECT COUNT(*) AS n FROM rev_recognition WHERE period = '2026-08'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision WHERE intent_id = 'int_rev_2026-08'")).toBe(0);
  });

  it("parked recognitions reserve the deferred balance, so August cannot be proposed against July's unapproved money either", async () => {
    const { db } = await concededWorld();
    recogniseMonth(db, "2026-07", { clock });
    db.prepare("INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor) VALUES ('BTX-AUG', '2026-08-31', 100, 'INTEREST')").run();
    const august = recogniseMonth(db, "2026-08", { clock }).lines;
    expect(august).toHaveLength(12);
    // July is parked, not posted: months are recognised in order, and the parked money is reserved either way
    expect(august.every((l) => l.status === "skipped" && l.reason === "earlier_period_unrecognised")).toBe(true);
  });

  it("a human-closed month is left alone", async () => {
    const db = await seededWorld();
    const june = recogniseMonth(db, "2026-06", { clock });
    expect(june.lines.length).toBeGreaterThan(0);
    expect(june.lines.every((l) => l.status === "skipped" && l.reason === "already_recognised")).toBe(true);
    expect(count(db, "SELECT COUNT(*) AS n FROM decision WHERE intent_id = 'int_rev_2026-06'")).toBe(0);
  });

  it("a recognition parked before the schedule moved is withdrawn by the revision, and the revised amount is proposed instead", async () => {
    const db = await seededWorld();
    const stale = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!; // parked at $12,000, before anyone knew about the concession
    postInitechMemo(db, { terms_change: TERMS });
    const [revision] = await revenueOnce(db, clock);
    expect(revision!.reason).toMatch(/recognition of \$12,000\.00 parked for 2026-07 was withdrawn/);
    expect(recognisedStatus(db, INITECH, "2026-07")).toBe("declined");
    expect(db.prepare("SELECT approver_id, approver_kind, outcome FROM approval WHERE decision_id = ?").get(stale.decision_id))
      .toEqual({ approver_id: "engine:revenue", approver_kind: "controller_agent", outcome: "rejected" });
    const fresh = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === INITECH)!;
    expect(fresh).toMatchObject({ status: "pending_approval", amount_cents: 1_080_000, schedule_version: 2 });
    expect(approveDecision(db, fresh.decision_id!, CFO, { clock }).status).toBe("posted");
    expect(db.prepare("SELECT amount_cents, decision_id FROM rev_recognition WHERE contract_id = ?").all(INITECH)).toEqual([{ amount_cents: 1_080_000, decision_id: fresh.decision_id }]);
    expect(deferredTieOut(db, "2026-07").rows.find((r) => r.party_id === "initech")).toMatchObject({ gl_deferred_cents: 0, tied: true });
    // declined at the same amount stays declined: the engine does not ask the same question twice
    const acme = recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === "CTR-acme-2026")!;
    approveDecision(db, acme.decision_id!, { ...CFO, outcome: "rejected" }, { clock });
    expect(recogniseMonth(db, "2026-07", { clock }).lines.find((l) => l.contract_id === "CTR-acme-2026")).toMatchObject({ status: "skipped", reason: "declined" });
  });

  it("before anything is recognised, the tie-out shows July's billing still deferred", async () => {
    const db = await seededWorld();
    ensureSchedules(db, clock); // the tie-out is a read: it builds nothing
    const tie = deferredTieOut(db, "2026-07");
    const julyBilled = (db.prepare("SELECT SUM(total_cents) AS n FROM invoice WHERE issue_date = '2026-07-01'").get() as { n: number }).n;
    expect(tie.total).toMatchObject({ gl_deferred_cents: julyBilled, expected_cents: 0, diff_cents: julyBilled, tied: false });
    expect(deferredTieOut(db, "2026-06").total).toMatchObject({ gl_deferred_cents: 0, expected_cents: 0, tied: true });
  });
});
