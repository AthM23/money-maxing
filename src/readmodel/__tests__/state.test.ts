import { describe, expect, it } from "vitest";
import { rebuildLadder } from "../../learn/autonomy.js";
import { approvePolicy, compilePolicies } from "../../learn/compile.js";
import { replay } from "../../learn/replay.js";
import { APP_CONFIG } from "../../packs/index.js";
import { openDb, type Db } from "../../runtime/db.js";
import { payloadText } from "../../runtime/payloadText.js";
import { seedMainScene } from "../../demo/scenario/mainScene.js";
import { seedGlobalJuly } from "../../demo/scenario/world.js";
import { runOpenIntents } from "../../worker/runOpenIntents.js";
import { buildConsoleState } from "../state.js";

let tick = 0;
const clock = { now: () => new Date(Date.parse("2026-07-23T12:00:00.000Z") + 1000 * tick++).toISOString() };

/** Copied from src/demo/scenario/__tests__/mainScene.test.ts: seed, replay closed history, compile and approve the fee rule, replay again, rebuild the ladder. */
async function world(): Promise<Db> {
  const db = openDb();
  seedGlobalJuly(db);
  seedMainScene(db);
  await replay(db, { investigators: [], function: "ar", clock });
  const [draft] = compilePolicies(db, clock, "ar");
  approvePolicy(db, clock, draft!.policy_id!, "U_CTRL");
  await replay(db, { investigators: [], function: "ar", clock });
  rebuildLadder(db, clock);
  return db;
}

describe("buildConsoleState", () => {
  it("shows the main scene's split, the rule card, a real evidence offset and what is awaiting a person", async () => {
    const db = await world();
    // Code only, the whole ar function: no model call, matching the HARD RULES for this task.
    await runOpenIntents(db, { investigators: [], function: "ar", clock, config: APP_CONFIG });
    const state = buildConsoleState(db);

    // (b) receipts: the main scene's split into cash, the bank's fee and the realized FX, all settled by code.
    const main = state.receipts.find((r) => r.intent_id === "int_main");
    expect(main?.party_name).toBe("Vossberg Logistik GmbH");
    expect(main?.posted.map((p) => `${p.kind}:${p.amount_cents}`)).toEqual(["apply_payment:10580000", "write_off:4000", "fx_realized:196000"]);
    expect(main?.status).toBe("open"); // what the customer held back is still unexplained; nobody has been asked yet in a code-only pass

    const fee = main!.posted.find((p) => p.kind === "write_off")!;
    expect(fee.settled_by.rule).toMatchObject({ code: "SHORT-PAY-01", version: 1 });
    expect(fee.settled_by.fact).toBeNull();
    expect(fee.settled_by.approvals).toEqual([]);

    const fx = main!.posted.find((p) => p.kind === "fx_realized")!;
    expect(fx.settled_by.rule).toBeNull();
    expect(fx.settled_by.fact).toBeNull();
    expect(fx.settled_by.model).toBeNull();
    expect(fx.settled_by.label).toBe("code, exact match");

    // (d) the rule card: SHORT-PAY-01 v1, approved, scoped to the customers its history was drafted from.
    const rule = state.rules.find((r) => r.code === "SHORT-PAY-01" && r.version === 1);
    expect(rule?.status).toBe("approved");
    expect(rule?.customer_scope).toContain("vossberg");
    expect((rule?.backtest as { agree: number }).agree).toBeGreaterThanOrEqual(3);
    expect((rule?.backtest as { held_out_n: number }).held_out_n).toBeGreaterThan(0);

    // (c) the workpaper for the FX decision: marks by class, and one evidence offset that really points at the quote.
    const workpaper = buildConsoleState(db, { decision_id: fx.decision_id }).workpaper;
    expect(workpaper?.marks_by_class.F.some((m) => m.check === "F9" && m.status === "pass")).toBe(true);
    const advice = workpaper?.evidence.find((e) => e.trace_id === "tr_advice_BTX-320" && e.quote === "Exchange rate applied 1.0800 USD per EUR");
    expect(advice?.offset).toBeTruthy();
    const traceRow = db.prepare("SELECT payload_json FROM trace WHERE id = 'tr_advice_BTX-320'").get() as { payload_json: string };
    const adviceText = payloadText(traceRow.payload_json);
    expect(adviceText.slice(advice!.offset!.start, advice!.offset!.end)).toBe(advice!.quote);

    // (c) the foreign split: cash, fee, realized FX and what is held back, with both rates.
    expect(workpaper?.foreign_split).toEqual({
      currency: "EUR", cash_cents: 10580000, fee_cents: 4000, realized_fx_cents: 196000,
      held_back_cents: 220000, booked_rate_ppm: 1100000, settled_rate_ppm: 1080000,
    });

    // (f) awaiting_you: Lumen's duplicate payment parks purely from code (it is over the approval threshold);
    // nothing has escalated and no rule draft or candidate fact is waiting, since no model tier ran.
    const lumen = state.awaiting_you.parked_entries.find((p) => p.party_id === "lumen");
    expect(lumen).toMatchObject({ kind: "apply_payment", amount_cents: 620000 });
    expect(state.awaiting_you.open_questions).toEqual([]);
    expect(state.awaiting_you.rule_drafts).toEqual([]);
    expect(state.awaiting_you.proposed_facts).toEqual([]);
  });

  it("groups cash by the bank line's own trace labels", async () => {
    const db = await world();
    const state = buildConsoleState(db);
    const group = state.cash.groups.find((g) => g.receipts.some((r) => r.bank_txn_id === "BTX-301"));
    expect(group).toMatchObject({ entity: "Northwind Systems Inc", account: "JPMorgan Chase USD operating ··4417" });
    expect(state.cash.total_cents).toBeGreaterThan(0);
  });
});
