import { readFileSync } from "node:fs";
import { emit } from "../../../bus/bus.js";
import type { Db } from "../../../ledger/db.js";
import type { World } from "../../../seed/world.js";
import type { ForecastLine } from "../index.js";

/** Shared by the forecast tests: the seeded world, a stand-in for the revenue engine, and the Initech revision event. */
export const WORLD = JSON.parse(readFileSync("world/northwind.json", "utf8")) as World;
export const AS_OF = "2026-07-14";
export const INITECH = "CTR-initech-2026";
export const INTENT = "int_initech_shortpay";
export const clock = { now: () => "2026-09-19T12:00:00Z" };

/** Local stand-in for the revenue engine: one schedule version of 12 monthly lines from the contract's start. */
export function writeSchedule(db: Db, contractId: string, version: number, monthlyCents: number): void {
  const c = db.prepare("SELECT party_id, start_date FROM contract WHERE id = ?").get(contractId) as { party_id: string; start_date: string };
  db.prepare("UPDATE rev_schedule SET status = 'superseded' WHERE contract_id = ?").run(contractId);
  const id = `rs_${contractId}_v${version}`;
  db.prepare("INSERT INTO rev_schedule (id, contract_id, party_id, version, status, total_cents, modification_id, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)")
    .run(id, contractId, c.party_id, version, monthlyCents * 12, version > 1 ? `mod_${contractId}_v${version}` : null, clock.now());
  const [y, m] = c.start_date.slice(0, 7).split("-").map(Number) as [number, number];
  for (let i = 0; i < 12; i++) {
    const index = y * 12 + (m - 1) + i;
    const period = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    db.prepare("INSERT INTO rev_schedule_line (schedule_id, period, amount_cents) VALUES (?, ?, ?)").run(id, period, monthlyCents);
  }
}

export function writeAllSchedules(db: Db): void {
  const rows = db.prepare("SELECT id, terms_json FROM contract").all() as Array<{ id: string; terms_json: string }>;
  for (const r of rows) writeSchedule(db, r.id, 1, (JSON.parse(r.terms_json) as { monthly_cents: number }).monthly_cents);
}

/** What the revenue engine emits for the Initech concession (payload shape: src/engines/README.md). */
export function emitInitechRevision(db: Db, factId: string | null = null): number {
  writeSchedule(db, INITECH, 2, 1_080_000);
  const periods = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"];
  return emit(db, {
    topic: "rev.schedule.revised", from_function: "revenue", intent_id: INTENT,
    payload: {
      modification_id: `mod_${INITECH}_v2`, contract_id: INITECH, party_id: "initech", cause_decision_id: "dec_initech_cm", treatment: "prospective",
      from_version: 1, to_version: 2, effective_period: "2026-07", until: "2027-06-30",
      before_total_cents: 14_400_000, after_total_cents: 12_960_000, delta_total_cents: -1_440_000, monthly_delta_cents: -120_000,
      lines: periods.map((period) => ({ period, before_cents: 1_200_000, after_cents: 1_080_000 })), fact_id: factId,
    },
  }, clock);
}
export const initechBilling = (lines: ForecastLine[]): ForecastLine[] => lines.filter((l) => l.kind === "ar_scheduled_billing" && l.source_ref.startsWith(`${INITECH}:`));
export const events = (db: Db, topic: string): Array<{ intent_id: string | null; payload: Record<string, unknown> }> =>
  (db.prepare("SELECT intent_id, payload_json FROM event WHERE topic = ? ORDER BY id").all(topic) as Array<{ intent_id: string | null; payload_json: string }>)
    .map((r) => ({ intent_id: r.intent_id, payload: JSON.parse(r.payload_json) as Record<string, unknown> }));
