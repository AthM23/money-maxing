import { describe, expect, it } from "vitest";
import { mirrorOnce } from "../mirror.js";
import { tieOut, tieOutText } from "../tieout.js";
import { FakeQbo, clock, openSeeded, postFxLoss, postPayment, seedManifest } from "./fixture.js";

/** QuickBooks holding INV-1042 (Initech, 12,000.00) with `balance` open, and one invoice of another world. */
function company(balance: number): FakeQbo {
  const qbo = new FakeQbo();
  qbo.answer = (sql) => (sql.startsWith("select * from Invoice")
    ? [{ Id: "150", DocNumber: "INV-1042", Balance: balance }, { Id: "201", DocNumber: "INV-3201", Balance: 110000 }]
    : []);
  return qbo;
}
const initech = async (db: ReturnType<typeof openSeeded>, qbo: FakeQbo) => (await tieOut(db, qbo)).ar.rows.find((r) => r.doc_id === "INV-1042");

describe("tie-out against QuickBooks", () => {
  it("agrees when nothing has happened, and sends only queries", async () => {
    const db = openSeeded();
    const qbo = company(12000);
    const t = await tieOut(db, qbo);
    expect(await initech(db, qbo)).toMatchObject({ status: "agrees", local_open_cents: 1200000, qbo_open_cents: 1200000 });
    expect(t.ar.other_world).toBe(1);
    expect(t.ok).toBe(true);
    expect(qbo.writes).toEqual([]);
  });

  it("a payment and an FX loss posted here but not mirrored yet explain the difference exactly", async () => {
    const db = openSeeded();
    postPayment(db);
    postFxLoss(db);
    expect(await initech(db, company(12000))).toMatchObject({ status: "explained", local_open_cents: 100400, unmirrored_cents: 1099600 });
  });

  it("once mirrored, the same QuickBooks balance is a real difference, and the right one agrees", async () => {
    const db = openSeeded();
    seedManifest(db);
    postPayment(db);
    postFxLoss(db);
    await mirrorOnce(db, { client: new FakeQbo() }, clock);
    const stale = await tieOut(db, company(12000));
    expect(stale.ar.rows.find((r) => r.doc_id === "INV-1042")).toMatchObject({ status: "differs", unmirrored_cents: 0 });
    expect(stale.ok).toBe(false);
    expect(tieOutText(stale)).toContain("DIFFERENCES");
    expect(await initech(db, company(1004))).toMatchObject({ status: "agrees" });
  });

  it("AP: bills QuickBooks does not hold are reported missing, not as agreeing", async () => {
    const db = openSeeded();
    const t = await tieOut(db, company(12000));
    expect(t.ap.rows).toEqual([]);
    expect(t.ap.missing_in_qbo).toHaveLength(10); // July's bills, received and not yet approved
    expect(tieOutText(t)).toContain("the seeder creates no Bills");
  });
});
