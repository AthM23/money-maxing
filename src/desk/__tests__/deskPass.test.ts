import { describe, expect, it } from "vitest";
import { recordHumanAnswer } from "../../agents/humanLoop.js";
import type { Investigator } from "../../agents/investigator.js";
import { seedDemoWorld } from "../../demo/seed.js";
import { fixedClock } from "../../runtime/__tests__/seed.js";
import { openDb, type Db } from "../../runtime/db.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { deskPass, type Poster } from "../deskPass.js";

const asksTheOwner: Investigator = {
  name: "scripted",
  async investigate(task, call) {
    const owner = call("crm_owner", { party_id: task.case_file.party_id }).output as { owner_user: string };
    call("escalate", {
      asked_user: owner.owner_user, party_id: task.case_file.party_id, predicate: "shortfall_reason", decision_kind: "credit_memo",
      what_happened: `Paid ${task.case_file.received_cents} of ${task.case_file.expected_cents} cents`,
      what_was_checked: [{ source: "mail_search", query: "credit", hits: 0 }], what_is_unknown: "Whether anyone agreed a credit",
      treatments: [{ id: "credit_memo", label: "Agreed credit" }, { id: "chase", label: "Error, chase it" }],
    });
    return { outcome: "escalated", summary: "asked the owner", places_looked: ["mail_search"] };
  },
};

function recorder(): Poster & { asked: string[]; approvals: [string, string][] } {
  const asked: string[] = [];
  const approvals: [string, string][] = [];
  return {
    asked, approvals,
    postEscalation: (id) => { asked.push(id); return Promise.resolve("ts-q"); },
    postApproval: (id, user) => { approvals.push([id, user]); return Promise.resolve("ts-a"); },
  };
}

async function worldWithWayneAsked(): Promise<Db> {
  const db = openDb();
  seedDemoWorld(db);
  db.prepare("UPDATE approver SET slack_user = id WHERE role != 'controller_agent'").run();
  await runOpenIntents(db, { investigators: [asksTheOwner], function: "ar", clock: fixedClock });
  return db;
}

describe("desk: every question and every parked entry reaches one person, once", () => {
  it("posts each open question once, and marks it so a second pass stays quiet", async () => {
    const db = await worldWithWayneAsked();
    const poster = recorder();
    const first = await deskPass(db, poster, fixedClock);
    expect(first.escalations_posted).toHaveLength(3);
    // The stand-in poster does not write slack_ts; the real transport does. Mark them as the transport would.
    db.prepare("UPDATE escalation SET slack_ts = 'ts-q'").run();
    expect((await deskPass(db, poster, fixedClock)).escalations_posted).toEqual([]);
  });

  it("routes a parked entry to the least senior person whose limit covers it, and asks only once", async () => {
    const db = await worldWithWayneAsked();
    const poster = recorder();
    await deskPass(db, poster, fixedClock);
    // Umbrella's $20 rule-driven write-off parked (no track record). Dana and Sam can each sign up to $5,000.
    expect(poster.approvals).toEqual([[expect.any(String), "U_DANA"]]);
    expect((await deskPass(db, poster, fixedClock)).approvals_posted).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision_step WHERE tool = 'desk:approval_request'").get()).toEqual({ n: 1 });
  });

  it("the person who asked for the credit is not the one asked to sign it, when someone else can", async () => {
    const db = await worldWithWayneAsked();
    const wayne = db.prepare("SELECT e.id FROM escalation e JOIN decision d ON d.id = e.decision_id WHERE d.intent_id = 'int_wayne'").get() as { id: string };
    const answered = recordHumanAnswer(db, wayne.id, "U_SAM", { treatment: "credit_memo", text: "One-time credit for the SSO outage.", uses: "one_time" }, { clock: fixedClock });
    expect(answered.status).toBe("answered");
    const poster = recorder();
    await deskPass(db, poster, fixedClock);
    const resume = db.prepare("SELECT id FROM decision WHERE intent_id = 'int_wayne' AND actor = 'router:resume'").get() as { id: string };
    // $3,300 is within Sam's and Dana's $5,000; Sam answered, so Dana is asked.
    expect(poster.approvals.find(([id]) => id === resume.id)).toEqual([resume.id, "U_DANA"]);
  });

  it("says so when nobody reachable has the authority, instead of dropping the entry", async () => {
    const db = await worldWithWayneAsked();
    db.prepare("UPDATE approver SET slack_user = NULL").run();
    const report = await deskPass(db, recorder(), fixedClock);
    expect(report.approvals_posted).toEqual([]);
    expect(report.unroutable[0]?.reason).toContain("no reachable approver");
  });
});
