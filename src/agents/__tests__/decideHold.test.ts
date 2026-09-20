import { describe, expect, it } from "vitest";
import { approveDecision } from "../../runtime/approve.js";
import type { Db } from "../../runtime/db.js";
import { readControlTotals } from "../../runtime/kernelContext.js";
import { fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import { decideHeldAmount } from "../decideHold.js";
import type { Investigator } from "../investigator.js";
import { runCase } from "../runCase.js";

const opts = { mode: "live" as const, autonomy_level: "auto" as const, clock: fixedClock };
const wayne = {
  intent_id: "int_9", function: "ar", party_id: "wayne", entry_date: "2026-07-16", bank_txn_id: "BTX-9",
  doc_ids: ["INV-1050"], expected_cents: 3300000, received_cents: 2970000, shortfall_cents: 330000, method: "ach", trace_ids: [],
};
const NOTE = "Wayne have held back 10% and say a credit was promised. Nothing is approved yet: AR holds it as disputed until an officer decides.";

/** What a model does when the documents say the amount is contested and the decision is a person's: it parks a hold. */
const parksAHold: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    call("propose_entry", {
      intent_id: task.case_file.intent_id, function: "ar", kind: "dispute_hold", party_id: "wayne", entry_date: "2026-07-16",
      applications: [{ doc_id: "INV-1050", amount_cents: 330000 }], entries: [],
      evidence: [{ claim: "nothing is approved, so the amount is held", trace_id: "tr_slack_wayne", quote: "AR holds it as disputed until an officer decides" }],
      policy_refs: [], fact_refs: [], judgment: [{ note: "The customer withheld 10%; no approval is on record.", confidence: "high" }],
    });
    return { outcome: "proposed", summary: "held as disputed", places_looked: ["slack"] };
  },
};

function seedWayne(db: Db): void {
  db.exec(`INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-9','2026-07-16',2970000,'ACH WAYNE ENT','ach','wayne');
           INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_9','ar','Resolve the $3,300 Wayne shortfall','ar','open','2026-07-16T09:00:00Z');`);
  db.prepare("INSERT INTO trace (id, source, kind, external_id, event_time, recorded_time, ingested_at, party_id, content_hash, payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("tr_slack_wayne", "slack", "chat_message", "c-1", "2026-07-10T10:00:00Z", "2026-07-10T10:00:00Z", "2026-07-10T10:00:00Z", "wayne", "h9", JSON.stringify({ text: NOTE }));
}

async function heldCase(): Promise<{ db: Db; holdId: string }> {
  const db = seedInitech();
  seedWayne(db);
  const r = await runCase(db, wayne, { ...opts, investigators: [parksAHold] });
  expect(r.final_route).toBe("PROPOSE");
  return { db, holdId: r.decision_id ?? "" };
}

describe("a held amount is a person's to decide", () => {
  it("deciding it sets the hold aside, keeps the question and the answer on record, remembers it, and parks the entry the answer calls for", async () => {
    const { db, holdId } = await heldCase();
    const text = "Approved: a one-time credit of $3,300 for the failed SSO rollout in June.";
    const out = decideHeldAmount(db, holdId, "U_CTRL", { treatment: "credit_memo", text, uses: "one_time" }, { clock: fixedClock });

    expect(out).toMatchObject({ status: "answered", fact_status: "active", proposal: { status: "pending_approval", route: "PROPOSE" } });
    expect(db.prepare("SELECT outcome, approver_id FROM approval WHERE decision_id = ?").get(holdId)).toEqual({ outcome: "rejected", approver_id: "U_CTRL" });
    const q = db.prepare("SELECT asked_user, json_extract(question_json, '$.what_happened') AS what, json_extract(answer_json, '$.text') AS answer FROM escalation WHERE decision_id = ?").get(holdId) as { asked_user: string; what: string; answer: string };
    expect(q.asked_user).toBe("U_CTRL");
    expect(q.what).toContain("USD 3,300.00 on INV-1050 is held as disputed");
    expect(q.answer).toBe(text);

    const memoId = out.status === "answered" && out.proposal?.status === "pending_approval" ? out.proposal.decision_id : "";
    expect(approveDecision(db, memoId, { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, { clock: fixedClock }).status).toBe("posted");
    expect(db.prepare("SELECT open_cents, status FROM invoice WHERE id = 'INV-1050'").get()).toEqual({ open_cents: 0, status: "paid" });
    expect((db.prepare("SELECT status FROM intent WHERE id = 'int_9'").get() as { status: string }).status).toBe("resolved");
    const t = readControlTotals(db);
    expect(t.ar_gl_cents).toBe(t.ar_subledger_cents);
  });

  it("keeping it held is an approval of the hold, not a decision, and a decision that cannot be recorded changes nothing", async () => {
    const { db, holdId } = await heldCase();
    expect(decideHeldAmount(db, holdId, "U_CTRL", { treatment: "dispute_hold", text: "keep holding", uses: "one_time" }, { clock: fixedClock }))
      .toEqual({ status: "invalid", detail: "to keep it held, approve the hold" });
    // Someone outside the approval matrix cannot set a hold aside: the whole decision rolls back.
    expect(() => decideHeldAmount(db, holdId, "U_NOBODY", { treatment: "write_off", text: "write it off", uses: "one_time" }, { clock: fixedClock })).toThrow(/nothing was changed/);
    expect((db.prepare("SELECT COUNT(*) AS n FROM escalation").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM approval WHERE decision_id = ?").get(holdId) as { n: number }).n).toBe(0);
    expect(decideHeldAmount(db, "dec_missing", "U_CTRL", { treatment: "write_off", text: "write it off", uses: "one_time" }, { clock: fixedClock }).status).toBe("not_found");
  });
});
