import { describe, expect, it } from "vitest";
import { ingest } from "../../ingest/ingest.js";
import { APP_CONFIG } from "../../packs/index.js";
import { routeTier0 } from "../../router/route.js";
import type { Db } from "../../runtime/db.js";
import { fixedClock, seedInitech } from "../../runtime/__tests__/seed.js";
import { approveFact, recordFactCandidate } from "../facts.js";
import { laterWordOnFact } from "../laterWord.js";

/**
 * Found by an outside review on 20 Sep and reproduced first: the CEO grants Initech 10% in one mail, it is remembered
 * as a standing fact, and he takes it back in a NEW mail. Nothing tied the new mail to the fact, so the fact stayed
 * active and the code tier posted the $400 concession from it with nobody involved.
 */
function world(): { db: Db; factId: string } {
  const db = seedInitech();
  db.exec(`INSERT INTO invoice (id, party_id, issue_date, due_date, total_cents, open_cents, status) VALUES ('INV-2000','initech','2026-07-01','2026-07-31',400000,400000,'open');
           UPDATE gl_line SET debit_cents = debit_cents + 400000 WHERE entry_id='je_open' AND line_no=1;
           UPDATE gl_line SET credit_cents = credit_cents + 400000 WHERE entry_id='je_open' AND line_no=2;
           INSERT INTO bank_txn (id, posted_date, amount_cents, descriptor, method, party_id) VALUES ('BTX-2','2026-07-13',360000,'ACH INITECH INC INV 2000','ach','initech');
           INSERT INTO intent (id, function, question, owner, status, created_at) VALUES ('int_2','ar','INV-2000 short by 400.00','ar','open','2026-07-13T09:00:00Z');`);
  const cand = recordFactCandidate(db, fixedClock, { party_id: "initech", predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
    valid_from: "2026-07-01", valid_to: "2027-06-30", source_trace_ids: ["tr_email_1"], stated_by: "U_DANA" });
  if (cand.status !== "candidate") throw new Error(JSON.stringify(cand));
  approveFact(db, fixedClock, cand.fact_id, "U_CTRL");
  return { db, factId: cand.fact_id };
}

const theCase = { intent_id: "int_2", function: "ar", party_id: "initech", entry_date: "2026-07-13", bank_txn_id: "BTX-2", doc_ids: ["INV-2000"],
  expected_cents: 400000, received_cents: 360000, shortfall_cents: 40000, method: "ach", trace_ids: [] };
const concessions = (db: Db): { route: string | null; posted: number }[] =>
  db.prepare("SELECT route, posted_at IS NOT NULL AS posted FROM decision WHERE intent_id = 'int_2' AND kind = 'credit_memo' AND mode = 'live'").all() as { route: string | null; posted: number }[];

describe("a remembered answer does not post alone once the person it came from has written again", () => {
  it("with nothing said since, the concession is booked from memory as before", () => {
    const { db, factId } = world();
    expect(laterWordOnFact(db, factId)).toEqual([]);
    routeTier0(db, theCase, { mode: "live", autonomy_level: "auto" }, { clock: fixedClock, config: APP_CONFIG });
    expect(concessions(db)).toEqual([{ route: "AUTO", posted: 1 }]);
  });

  it("the CEO withdraws it in a new mail: the entry is still prepared, but it waits for a person who can read both", async () => {
    const { db, factId } = world();
    await ingest(db, [{ source: "gmail", kind: "email", external_id: "msg-2", event_time: "2026-07-11T09:00:00Z", recorded_time: "2026-07-11T09:00:00Z",
      payload: { from: "ceo@northwind.test", subject: "Re: Initech pricing", body: "Dana, I am withdrawing the Initech 10% concession effective today. Bill them list price; no more credits." },
      party_hint: { party_id: "initech" } }], fixedClock);
    expect(laterWordOnFact(db, factId).map((m) => m.at)).toEqual(["2026-07-11T09:00:00Z"]);
    routeTier0(db, theCase, { mode: "live", autonomy_level: "auto" }, { clock: fixedClock, config: APP_CONFIG });
    expect(concessions(db)).toEqual([{ route: "PROPOSE", posted: 0 }]);
    const marks = (db.prepare("SELECT w.marks_json FROM workpaper w JOIN decision d ON d.id = w.decision_id WHERE d.intent_id = 'int_2' AND d.kind = 'credit_memo'").get() as { marks_json: string }).marks_json;
    expect(marks).toContain("there is a later word from the same person or thread");
    expect((db.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-2000'").get() as { open_cents: number }).open_cents).toBe(40000);
  });

  it("a later mail from somebody else, about something else, changes nothing", async () => {
    const { db, factId } = world();
    await ingest(db, [{ source: "gmail", kind: "email", external_id: "msg-3", event_time: "2026-07-11T09:00:00Z", recorded_time: "2026-07-11T09:00:00Z",
      payload: { from: "ap@initech.test", subject: "Remittance advice July", body: "Payment of 3,600.00 sent today for INV-2000." }, party_hint: { party_id: "initech" } }], fixedClock);
    expect(laterWordOnFact(db, factId)).toEqual([]);
  });
});
