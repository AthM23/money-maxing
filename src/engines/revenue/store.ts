import type { Db } from "../../ledger/db.js";
import { systemClock, type Clock } from "../../runtime/config.js";
import { ratableMonthly, sumLines, type ScheduleLine } from "./schedule.js";

export interface RevSchedule {
  id: string;
  contract_id: string;
  party_id: string;
  version: number;
  status: "active" | "superseded";
  method: string;
  total_cents: number;
  modification_id: string | null;
  created_at: string;
  lines: ScheduleLine[];
}

export interface ContractRow { id: string; party_id: string; start_date: string; end_date: string; value_cents: number; trace_id: string | null }

/** blocked and declined are dead decisions: the kernel refused the approver (route BLOCK is terminal), or a person said no. */
export type RecognisedStatus = "locked" | "posted" | "pending" | "blocked" | "declined" | "none";

type ScheduleRow = Omit<RevSchedule, "lines">;

/** Readable and deterministic, so a second writer racing on the same contract collides instead of duplicating. */
export const scheduleId = (contractId: string, version: number): string => `rs_${contractId}_v${version}`;

export function getContract(db: Db, contractId: string): ContractRow | undefined {
  return db.prepare("SELECT id, party_id, start_date, end_date, value_cents, trace_id FROM contract WHERE id = ?").get(contractId) as ContractRow | undefined;
}

/**
 * Version 1 for every contract that has no schedule yet: the contract value spread ratably over its term.
 * Idempotent, so every engine entry point calls it first instead of depending on a set-up step having run.
 */
export function ensureSchedules(db: Db, clock: Clock = systemClock): number {
  return ensureSchedulesDetailed(db, clock).created;
}

export interface EnsureSchedulesResult { created: number; failed: { contract_id: string; error: string }[] }

/**
 * One contract whose terms cannot be spread (an end date before its start, a non-integer value) must not stop the
 * other twelve, and must not make a bus handler throw, which would wedge the revenue cursor on that event forever.
 * It is skipped and reported; it has no schedule, so nothing is recognised for it until a person fixes the contract.
 */
export function ensureSchedulesDetailed(db: Db, clock: Clock = systemClock): EnsureSchedulesResult {
  const missing = db
    .prepare("SELECT id, party_id, start_date, end_date, value_cents, trace_id FROM contract c WHERE NOT EXISTS (SELECT 1 FROM rev_schedule s WHERE s.contract_id = c.id) ORDER BY id")
    .all() as ContractRow[];
  const result: EnsureSchedulesResult = { created: 0, failed: [] };
  for (const c of missing) {
    try {
      const lines = ratableMonthly(c.value_cents, c.start_date, c.end_date);
      db.transaction(() => insertSchedule(db, clock, { contract_id: c.id, party_id: c.party_id, version: 1, modification_id: null, lines }))();
      result.created += 1;
    } catch (err) {
      result.failed.push({ contract_id: c.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/** Write one schedule version as `active`. total_cents is computed here, from the lines, so the two can never disagree. */
export function insertSchedule(
  db: Db, clock: Clock, s: { contract_id: string; party_id: string; version: number; modification_id: string | null; lines: readonly ScheduleLine[] },
): string {
  const id = scheduleId(s.contract_id, s.version);
  db.prepare("INSERT INTO rev_schedule (id, contract_id, party_id, version, status, method, total_cents, modification_id, created_at) VALUES (?, ?, ?, ?, 'active', 'ratable_monthly', ?, ?, ?)")
    .run(id, s.contract_id, s.party_id, s.version, sumLines(s.lines), s.modification_id, clock.now());
  const line = db.prepare("INSERT INTO rev_schedule_line (schedule_id, period, amount_cents) VALUES (?, ?, ?)");
  for (const l of s.lines) line.run(id, l.period, l.amount_cents);
  return id;
}

function withLines(db: Db, row: ScheduleRow): RevSchedule {
  const lines = db.prepare("SELECT period, amount_cents FROM rev_schedule_line WHERE schedule_id = ? ORDER BY period").all(row.id) as ScheduleLine[];
  return { ...row, lines };
}

const SCHEDULE_COLUMNS = "id, contract_id, party_id, version, status, method, total_cents, modification_id, created_at";

export function activeSchedule(db: Db, contractId: string): RevSchedule | undefined {
  const row = db.prepare(`SELECT ${SCHEDULE_COLUMNS} FROM rev_schedule WHERE contract_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1`).get(contractId) as ScheduleRow | undefined;
  return row ? withLines(db, row) : undefined;
}

/** Every version of a contract's schedule, oldest first, with lines. */
export function scheduleVersions(db: Db, contractId: string): RevSchedule[] {
  const rows = db.prepare(`SELECT ${SCHEDULE_COLUMNS} FROM rev_schedule WHERE contract_id = ? ORDER BY version`).all(contractId) as ScheduleRow[];
  return rows.map((r) => withLines(db, r));
}

/** First period the books know about. Anything earlier was earned before this ledger existed. */
export function booksStart(db: Db): string | null {
  return (db.prepare("SELECT MIN(id) AS p FROM period").get() as { p: string | null }).p;
}

/**
 * Periods of this contract a revision must not touch: months the humans closed (`period.status = 'locked'`), months
 * before the books begin, and months whose recognition decision has actually posted. A recognition that is only
 * parked for approval does NOT count: until it posts, revenue has not moved.
 */
export function recognisedPeriods(db: Db, contractId: string): Set<string> {
  const out = new Set<string>();
  for (const r of db.prepare("SELECT id FROM period WHERE status = 'locked'").all() as { id: string }[]) out.add(r.id);
  const start = booksStart(db);
  const schedule = activeSchedule(db, contractId);
  if (start && schedule) for (const l of schedule.lines) if (l.period < start) out.add(l.period);
  const posted = db
    .prepare("SELECT r.period FROM rev_recognition r JOIN decision d ON d.id = r.decision_id WHERE r.contract_id = ? AND d.posted_at IS NOT NULL")
    .all(contractId) as { period: string }[];
  for (const r of posted) out.add(r.period);
  return out;
}

/** Where one contract-month stands. "Did it post" is read from the decision, never from what a caller remembers. */
export function recognisedStatus(db: Db, contractId: string, period: string): RecognisedStatus {
  const row = db
    .prepare(
      `SELECT d.posted_at AS posted_at, d.route AS route,
              EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected') AS declined
       FROM rev_recognition r JOIN decision d ON d.id = r.decision_id WHERE r.contract_id = ? AND r.period = ?`,
    )
    .get(contractId, period) as { posted_at: string | null; route: string | null; declined: number } | undefined;
  if (row?.posted_at) return "posted";
  if (row) return row.declined ? "declined" : row.route === "BLOCK" ? "blocked" : "pending";
  const p = db.prepare("SELECT status FROM period WHERE id = ?").get(period) as { status: string } | undefined;
  const start = booksStart(db);
  if (p?.status === "locked" || (start !== null && period < start)) return "locked";
  return "none";
}
