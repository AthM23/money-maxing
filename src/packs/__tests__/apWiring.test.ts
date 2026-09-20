import { describe, expect, it } from "vitest";
import { addBill, apCase, apClock, BILL_ID, INTENT_ID, PO_ID, seedAp } from "../../agents/ap/__tests__/seed.js";
import { approveBillProposal, decisionIdOf, marksOf } from "../../agents/ap/__tests__/helpers.js";
import type { Investigator } from "../../agents/investigator.js";
import { runCase } from "../../agents/runCase.js";
import { approveDecision } from "../../runtime/approve.js";
import { DEFAULT_CONFIG } from "../../runtime/config.js";
import { proposeEntry } from "../../runtime/proposeEntry.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { APP_CONFIG, packFor } from "../index.js";

const deps = { clock: apClock, config: APP_CONFIG };

describe("packs: the function decides the code tier, the prompt and the kernel's extra checks", () => {
  it("an AP intent goes through the AP code tier from the worker, with no model call", async () => {
    const db = seedAp();
    db.prepare("UPDATE intent SET case_json = ? WHERE id = ?").run(JSON.stringify(apCase()), INTENT_ID);
    const report = await runOpenIntents(db, { investigators: [], autonomy_level: "auto", clock: apClock });
    expect(report.worked).toMatchObject([{ intent_id: INTENT_ID, function: "ap", routes: ["AUTO"], status: "resolved" }]);
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "approved" });
  });

  it("the model tier for an AP case gets the AP prompt and an AP task message, never the AR ones", async () => {
    const db = seedAp({ bill_total_cents: 50000 });
    let seen = { system: "", message: "" };
    const spy: Investigator = {
      name: "spy",
      async investigate(task) {
        seen = { system: task.system_prompt, message: task.task_message };
        return { outcome: "refused", summary: "looked, found nothing", places_looked: ["mail"] };
      },
    };
    await runCase(db, apCase({ received_cents: 50000, expected_cents: 40000 }), { mode: "live", autonomy_level: "auto", investigators: [spy], clock: apClock });
    expect(seen.system).toBe(packFor("ap")!.system_prompt);
    expect(seen.system).not.toBe(packFor("ar")!.system_prompt);
    expect(seen.message).toContain(BILL_ID);
  });

  it("a function with no pack is never worked on another function's instructions: it goes to a person", async () => {
    const db = seedAp();
    db.prepare("INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_rev','revenue','Recognise July','revenue','open','2026-07-20T00:00:00Z')").run();
    let called = false;
    const spy: Investigator = { name: "spy", investigate: () => { called = true; return Promise.resolve({ outcome: "refused", summary: "", places_looked: [] }); } };
    const r = await runCase(db, { ...apCase(), intent_id: "int_rev", function: "revenue" }, { mode: "live", autonomy_level: "auto", investigators: [spy], clock: apClock });
    expect(called).toBe(false);
    expect(r.final_route).toBeNull();
    expect(r.notes.join(" ")).toContain("no pack is built for function revenue");
    expect(db.prepare("SELECT status FROM intent WHERE id = 'int_rev'").get()).toEqual({ status: "waiting_on_human" });
  });
});

describe("packs: AP checks run at every gate, and their absence never reads as a pass", () => {
  it("corpus H-1: a bill parked for approval cannot be approved once a duplicate of it has been taken on", () => {
    const db = seedAp({ bill_total_cents: 60000, po_lines_json: JSON.stringify([{ sku: "WIDGET", qty: 15, unit_cents: 4000 }]), receipt_qtys: [15] });
    const parked = proposeEntry(db, approveBillProposal(db), { actor: "agent:ap:test", mode: "live", autonomy_level: "auto", tier: 1 }, deps);
    expect(parked.status).toBe("pending_approval");
    addBill(db, { id: "BILL-DUP", vendor_invoice_no: "ACME-1001-R", total_cents: 60000, po_id: PO_ID, status: "approved" });
    const approved = approveDecision(db, decisionIdOf(parked), { approver_id: "U_CTRL", approver_kind: "human", outcome: "approved" }, deps);
    expect(approved.status).toBe("rejected");
    expect(approved.status === "rejected" && approved.failed.map((m) => m.check)).toContain("P7");
    expect(db.prepare("SELECT status FROM bill WHERE id = ?").get(BILL_ID)).toEqual({ status: "open" });
  });

  it("an AP entry proposed without the pack's checks configured is rejected, not waved through", () => {
    const db = seedAp();
    const r = proposeEntry(db, approveBillProposal(db), { actor: "agent:ap:test", mode: "live", autonomy_level: "auto", tier: 1 }, { clock: apClock, config: DEFAULT_CONFIG });
    expect(r.status).toBe("rejected");
    expect(r.status === "rejected" && r.failed.map((m) => m.check)).toEqual(["X2"]);
  });

  it("a bill with no purchase order is a judgment mark, and a judgment mark from a pack now forces approval", () => {
    const db = seedAp({ bill_po_id: null });
    const r = proposeEntry(db, approveBillProposal(db), { actor: "agent:ap:test", mode: "live", autonomy_level: "auto", tier: 1 }, deps);
    expect(r.status).toBe("pending_approval");
    expect(marksOf(db, decisionIdOf(r)).find((m) => m.check === "E4")?.status).toBe("judgment");
  });
});
