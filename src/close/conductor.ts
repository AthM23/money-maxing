import { poll, type BusEvent } from "../bus/bus.js";
import type { Topic } from "../contract/topics.js";
import { periodOf, worldToday } from "../engines/asOf.js";
import { recordRipple } from "../engines/ripple.js";
import type { Db } from "../ledger/db.js";
import { systemClock, type Clock } from "../runtime/config.js";
import { ACCRUALS_SLUG, CLOSE_TEMPLATE, LOCK_SLUG, checklistFor, itemId, type ChecklistItemDef, type ChecklistTemplateItem } from "./checklist.js";

export type ItemStatus = "todo" | "in_progress" | "blocked" | "done";
export interface Transition { id: string; from: ItemStatus; to: ItemStatus }

export interface ChecklistRow {
  id: string; period: string; function: string; name: string; status: ItemStatus;
  /** While the item is not done this is the "what is stuck" text, whatever the status. Null when done. */
  blocked_reason: string | null;
  depends_on: string[];
  decision_ids: string[];
}

export interface ChecklistView {
  period: string;
  items: ChecklistRow[];
  counts: Record<ItemStatus, number>;
  /** Everything a machine can do in this phase is done. It is reported, never acted on: locking is a person's call. */
  ready_to_lock: boolean;
}

export const CLOSE_SUBSCRIBER = "close";
export const CLOSE_TOPICS: readonly Topic[] = [
  "entry.posted", "ar.credit_memo.posted", "rev.schedule.revised", "rev.recognised", "forecast.updated",
  "human.escalation.opened", "human.escalation.answered", "bankrec.unmatched",
];

/**
 * Dependency order (Kahn). A dependency on an item the template does not have, or a cycle, is a configuration
 * error and throws before anything is written: a checklist that can never finish must not be seeded.
 */
export function topoOrder(defs: readonly ChecklistItemDef[]): ChecklistItemDef[] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  if (byId.size !== defs.length) throw new Error("checklist template has duplicate item ids");
  const waiting = new Map(defs.map((d) => [d.id, new Set(d.depends_on)]));
  for (const d of defs) for (const dep of d.depends_on) if (!byId.has(dep)) throw new Error(`checklist item ${d.id} depends on unknown item ${dep}`);
  const out: ChecklistItemDef[] = [];
  while (waiting.size > 0) {
    const ready = [...waiting.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (ready.length === 0) throw new Error(`checklist template has a dependency cycle among: ${[...waiting.keys()].join(", ")}`);
    for (const id of ready) {
      waiting.delete(id);
      out.push(byId.get(id)!);
      for (const deps of waiting.values()) deps.delete(id);
    }
  }
  return out;
}

/** A board may only be written for a month somebody can still work on: a locked period's checklist is history. */
const isLive = (db: Db, period: string): boolean =>
  db.prepare("SELECT 1 FROM period WHERE id = ? AND status IN ('open','closing')").get(period) !== undefined;

/**
 * Insert the period's missing checklist rows as 'todo'. Idempotent; returns how many were inserted. A period that is
 * locked or does not exist gets nothing (0): the template is still validated first, so a bad template always throws.
 */
export function ensureChecklist(db: Db, period: string, template: readonly ChecklistTemplateItem[] = CLOSE_TEMPLATE): number {
  const defs = checklistFor(period, template);
  topoOrder(defs);
  if (!isLive(db, period)) return 0;
  const insert = db.prepare("INSERT OR IGNORE INTO checklist_item (id, period, function, name, depends_on_json, status) VALUES (?, ?, ?, ?, ?, 'todo')");
  let inserted = 0;
  db.transaction(() => {
    for (const d of defs) inserted += insert.run(d.id, period, d.function, d.name, JSON.stringify(d.depends_on)).changes;
  })();
  return inserted;
}

interface StoredRow { id: string; status: ItemStatus; blocked_reason: string | null; decision_ids_json: string }

/**
 * Re-read every condition from the ledger, in dependency order, and store the answer. An item is done because its
 * condition holds now, so a done item goes back when the ledger changes under it (a new concession arrives).
 * `_clock` is accepted for symmetry with the engines; `checklist_item` carries no timestamps.
 * A locked or unknown period is refused: nothing is written and no transition is reported.
 */
export function evaluateChecklist(db: Db, period: string, _clock: Clock = systemClock, template: readonly ChecklistTemplateItem[] = CLOSE_TEMPLATE): Transition[] {
  ensureChecklist(db, period, template);
  const order = topoOrder(checklistFor(period, template));
  if (!isLive(db, period)) return [];
  const names = new Map(order.map((d) => [d.id, d.name]));
  const read = db.prepare("SELECT id, status, blocked_reason, decision_ids_json FROM checklist_item WHERE id = ?");
  const write = db.prepare("UPDATE checklist_item SET status = ?, blocked_reason = ?, decision_ids_json = ? WHERE id = ?");
  const done = new Set<string>();
  const transitions: Transition[] = [];
  db.transaction(() => {
    for (const def of order) {
      const was = read.get(def.id) as StoredRow;
      const result = def.check(db, period);
      const notDone = def.depends_on.filter((dep) => !done.has(dep));
      const status: ItemStatus = notDone.length > 0 ? "blocked" : result.done ? "done" : result.decision_ids.length > 0 || result.partial ? "in_progress" : "todo";
      const reason = status === "done" ? null : status === "blocked" ? `waiting on: ${notDone.map((dep) => names.get(dep)).join("; ")}` : result.reason;
      const ids = JSON.stringify(result.decision_ids);
      if (status === "done") done.add(def.id);
      if (was.status !== status || was.blocked_reason !== reason || was.decision_ids_json !== ids) write.run(status, reason, ids, def.id);
      if (was.status !== status) transitions.push({ id: def.id, from: was.status, to: status });
    }
  })();
  return transitions;
}

const parseIds = (json: string): string[] => {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** The board as stored: the last evaluation's answer, in template order. Reads only; it never re-evaluates. */
export function getChecklist(db: Db, period: string): ChecklistView {
  const rows = db
    .prepare("SELECT id, period, function, name, status, blocked_reason, depends_on_json, decision_ids_json FROM checklist_item WHERE period = ? ORDER BY rowid")
    .all(period) as Array<Omit<ChecklistRow, "depends_on" | "decision_ids"> & { depends_on_json: string; decision_ids_json: string }>;
  const items = rows.map(({ depends_on_json, decision_ids_json, ...r }) => ({ ...r, depends_on: parseIds(depends_on_json), decision_ids: parseIds(decision_ids_json) }));
  const counts: Record<ItemStatus, number> = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const i of items) counts[i.status]++;
  const machine = items.filter((i) => i.id !== itemId(period, LOCK_SLUG) && i.id !== itemId(period, ACCRUALS_SLUG));
  return { period, items, counts, ready_to_lock: machine.length > 0 && machine.every((i) => i.status === "done") };
}

export interface ChecklistTick { item_id: string; intent_id: string; decision_id: string }
export interface CloseOnceResult {
  events: number;
  periods: string[];
  transitions: Transition[];
  /** Ripple rows written by this poll (a redelivered event writes none). */
  ticks: ChecklistTick[];
  /** Periods where everything except accruals (Phase 3) and the lock itself is done. Reported only. */
  ready_to_lock: string[];
}

/** One pass of the conductor: drain the bus, re-evaluate every live period once, record the ticks. */
export async function closeOnce(db: Db, clock: Clock = systemClock): Promise<CloseOnceResult> {
  const batch: BusEvent[] = [];
  await poll(db, CLOSE_SUBSCRIBER, CLOSE_TOPICS, (e) => { batch.push(e); });
  const periods = periodsToEvaluate(db);
  const transitions: Transition[] = [];
  const ticks: ChecklistTick[] = [];
  const ready: string[] = [];
  for (const period of periods) {
    transitions.push(...evaluateChecklist(db, period, clock));
    const view = getChecklist(db, period);
    ticks.push(...recordTicks(db, clock, view, batch));
    if (view.ready_to_lock) ready.push(period);
  }
  return { events: batch.length, periods, transitions, ticks, ready_to_lock: ready };
}

/**
 * Every period still being worked on ('open' or 'closing') that has a board, plus the period the world is in today
 * (so the board exists before the first event). The batch does not narrow this: a parked proposal emits no event, so
 * an earlier open month can change under a done item without the bus saying anything. Locked periods and months
 * nobody opened are never evaluated: their checklist is history.
 */
function periodsToEvaluate(db: Db): string[] {
  const live = new Set((db.prepare("SELECT id FROM period WHERE status IN ('open','closing')").all() as { id: string }[]).map((p) => p.id));
  const out = new Set((db.prepare("SELECT DISTINCT period FROM checklist_item").all() as { period: string }[]).map((s) => s.period));
  const today = currentPeriod(db);
  if (today) out.add(today);
  return [...out].filter((p) => live.has(p)).sort();
}

function currentPeriod(db: Db): string | null {
  try {
    return periodOf(worldToday(db));
  } catch {
    return null; // no bank lines and no open period: nothing to conduct
  }
}

/** Seeded history and Q2 replay cases are not work anyone did in this close: they get no tick. */
const isHistory = (intentId: string): boolean => intentId === "int_seed" || intentId.startsWith("int_replay_"); // ids per src/seed/local.ts

/**
 * Link a done item back to the intents that caused it. The rule is "the item is done now and it rests on this
 * decision", for EVERY decision it rests on, not only those in this event batch: a memo posted while another was
 * still parked saw the item not done, and when the second one posts in a later batch the first intent still
 * deserves its tick. The intent comes from the decision row. recordRipple makes it idempotent.
 */
function recordTicks(db: Db, clock: Clock, view: ChecklistView, batch: readonly BusEvent[]): ChecklistTick[] {
  const eventOf = new Map<string, number>();
  for (const e of batch) {
    for (const v of [e.payload.decision_id, e.payload.cause_decision_id]) if (typeof v === "string" && !eventOf.has(v)) eventOf.set(v, e.id);
  }
  // the join is the foreign-key check: the artifact row needs both the decision and its intent to exist
  const cause = db.prepare("SELECT d.intent_id, d.mode FROM decision d JOIN intent i ON i.id = d.intent_id WHERE d.id = ?");
  const out: ChecklistTick[] = [];
  for (const item of view.items.filter((i) => i.status === "done")) {
    for (const decisionId of item.decision_ids) {
      const found = cause.get(decisionId) as { intent_id: string; mode: string } | undefined;
      if (!found || found.mode !== "live" || isHistory(found.intent_id)) continue;
      const fresh = recordRipple(db, {
        intent_id: found.intent_id, function: "close", kind: "checklist_tick", ref: item.id, event_id: eventOf.get(decisionId) ?? null,
        summary: `Close ${view.period}: "${item.name}" ticked`, artifact: { decision_id: decisionId, system: "checklist" },
      }, clock);
      if (fresh) out.push({ item_id: item.id, intent_id: found.intent_id, decision_id: decisionId });
    }
  }
  return out;
}
