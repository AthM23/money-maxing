import { describe, expect, it } from "vitest";
import type { QboRef } from "../../connectors/qboClient.js";
import { mirrorOnce } from "../mirror.js";
import { resetMirror, type QboResettable } from "../reset.js";
import type { QboObject } from "../types.js";
import { FakeQbo, clock, logRows, openSeeded, postCreditMemo, postFxLoss, postPayment, seedManifest } from "./fixture.js";

/** The company the FakeQbo built, with delete: a linked object cannot go before the Payment that links it. */
function company(qbo: FakeQbo): QboResettable & { deleted: string[] } {
  const deleted: string[] = [];
  const linked = (id: string): boolean => qbo.stored.some((s) => s.entity === "Payment" && JSON.stringify(s.obj.Line ?? []).includes(`"TxnId":"${id}"`));
  return {
    deleted,
    query: async <T = QboObject>(sql: string) => qbo.remember().query(sql.replace(/ maxresults \d+$/, "")) as Promise<T[]>,
    remove: async (entity: string, ref: QboRef) => {
      if (entity !== "Payment" && linked(ref.Id)) throw new Error(`${entity} ${ref.Id} is linked by a Payment`);
      qbo.stored = qbo.stored.filter((s) => !(s.entity === entity && s.obj.Id === ref.Id));
      deleted.push(`${entity} ${ref.Id}`);
    },
  };
}

describe("mirror reset", () => {
  it("deletes what the mirror made, Payments first, leaves the seeder's Payment, and the next pass mirrors it all again", async () => {
    const db = openSeeded();
    seedManifest(db);
    const ids = [postPayment(db), postCreditMemo(db)]; // together they settle INV-1042: the FX loss has the second test
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    qbo.stored.push({ entity: "Payment", obj: { Id: "5", PaymentRefNum: "BTX-300", PrivateNote: "fn:BTX-300", TotalAmt: 6200 } }); // the seeder's
    const made = qbo.writes.length;

    const target = company(qbo);
    const result = await resetMirror(db, target);
    expect(result.failed).toEqual([]);
    expect(result.removed).toEqual({ Payment: 2, Attachable: 2, CreditMemo: 1 });
    expect(target.deleted.slice(0, 2).every((d) => d.startsWith("Payment "))).toBe(true);
    expect(qbo.stored.map((s) => `${s.entity} ${s.obj.Id}`)).toEqual(["Payment 5"]);
    expect(ids.flatMap((id) => logRows(db, id))).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM ripple WHERE kind LIKE 'qbo%'").get()).toEqual({ n: 0 });

    // QuickBooks answers the same requestid with the deleted object: the mirror must notice and really create again
    const again = await mirrorOnce(db, { client: qbo.remember() }, clock);
    expect(again.steps.filter((s) => s.status === "mirrored")).toHaveLength(made);
    expect(again.steps.every((s) => s.detail === "created")).toBe(true);
    const live = (id: string | null): boolean => qbo.stored.some((s) => s.obj.Id === id);
    expect(again.steps.every((s) => live(s.external_id))).toBe(true);
    expect(qbo.stored.filter((s) => s.entity !== "Attachable").map((s) => s.entity).sort()).toEqual(["CreditMemo", "Payment", "Payment", "Payment"]);
  });

  it("works with no local database: the stage database is thrown away between runs", async () => {
    const db = openSeeded();
    seedManifest(db);
    postFxLoss(db);
    const qbo = new FakeQbo();
    await mirrorOnce(db, { client: qbo }, clock);
    const result = await resetMirror(null, company(qbo));
    expect(result.removed).toEqual({ Payment: 1, JournalEntry: 1 });
    expect(qbo.stored).toEqual([]);
  });
});
