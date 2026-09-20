import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { getChecklist } from "../src/close/conductor.js";
import { worldToday } from "../src/engines/asOf.js";
import { diffVersions } from "../src/engines/forecast/diff.js";
import { getForecast } from "../src/engines/forecast/read.js";
import { recognisedStatus } from "../src/engines/revenue/store.js";
import { dbPath, openWorldDb, type Db } from "../src/ledger/db.js";
import { bankUnmatched, trialBalance } from "../src/ledger/read.js";
import { readControlTotals } from "../src/runtime/kernelContext.js";

/**
 * Console v0: one page polling SQLite through a read-only JSON API. No framework and no build step, so it runs
 * wherever the database is. `pnpm console` → http://localhost:4317
 *
 * Every Phase 2 table may be empty, or missing on an old database file that something else holds read-only, so each
 * board is read through `rows` / `safe`: a missing piece is an empty array on the page, never a 500.
 */
const PORT = Number(process.env.FOOTNOTE_CONSOLE_PORT ?? 4317);
const PAGE = fileURLToPath(new URL("./index.html", import.meta.url));

type Row = Record<string, unknown>;

const parse = (s: unknown): unknown => { try { return typeof s === "string" && s ? JSON.parse(s) : null; } catch { return null; } };
const idList = (s: unknown): string[] => { const v = parse(s); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; };

function safe<T>(fallback: T, fn: () => T): T {
  try { return fn(); } catch { return fallback; }
}

function hasTable(db: Db, name: string): boolean {
  return safe(false, () => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)));
}

/** All rows of a query whose main table may not exist. */
function rows(db: Db, table: string, sql: string, ...args: unknown[]): Row[] {
  return hasTable(db, table) ? safe<Row[]>([], () => db.prepare(sql).all(...args) as Row[]) : [];
}

const placeholders = (n: number): string => Array.from({ length: n }, () => "?").join(",");

// ───────────── main page: summary, drift board, boards

function summary(db: Db): Row {
  const count = (sql: string): number => safe(0, () => (db.prepare(sql).get() as { n: number }).n);
  const control = safe<Partial<ReturnType<typeof readControlTotals>>>({}, () => readControlTotals(db));
  return {
    traces: rows(db, "trace", "SELECT source, COUNT(*) AS n FROM trace GROUP BY source ORDER BY source"),
    bank_lines: count("SELECT COUNT(*) AS n FROM bank_txn"),
    bank_unmatched: safe(0, () => bankUnmatched(db).length),
    intents_open: count("SELECT COUNT(*) AS n FROM intent WHERE status IN ('open','waiting_on_human') AND owner NOT IN ('seed','replay')"),
    intents_resolved: count("SELECT COUNT(*) AS n FROM intent WHERE status = 'resolved' AND owner NOT IN ('seed','replay')"),
    routes: rows(db, "decision", "SELECT route, COUNT(*) AS n FROM decision WHERE route IS NOT NULL AND mode = 'live' GROUP BY route"),
    model_calls: count("SELECT COALESCE(SUM(model_calls), 0) AS n FROM decision WHERE mode = 'live'"),
    ar_gl_cents: control.ar_gl_cents ?? 0, ar_subledger_cents: control.ar_subledger_cents ?? 0,
    ap_gl_cents: control.ap_gl_cents ?? 0, ap_subledger_cents: control.ap_subledger_cents ?? 0,
  };
}

/** The drift board: every live intent, with the comparator that opened it (C1 rows are function `revenue`). */
function intentList(db: Db): Row[] {
  const drift = new Map(rows(db, "drift_case", "SELECT intent_id, comparator, dedupe_key, delta_cents FROM drift_case").map((r) => [r.intent_id as string, r]));
  return rows(
    db, "intent",
    `SELECT i.id, i.function, i.question, i.status, i.created_at, i.closed_at, i.case_json,
            (SELECT GROUP_CONCAT(d.route, '+') FROM decision d WHERE d.intent_id = i.id AND d.route IS NOT NULL) AS routes,
            (SELECT MAX(d.tier) FROM decision d WHERE d.intent_id = i.id) AS tier,
            (SELECT COUNT(*) FROM decision d WHERE d.intent_id = i.id) AS decisions,
            (SELECT COUNT(*) FROM artifact a WHERE a.intent_id = i.id) AS artifacts
     FROM intent i WHERE i.owner NOT IN ('seed','replay') ORDER BY i.created_at DESC, i.id LIMIT 200`,
  ).map((r) => {
    const d = drift.get(r.id as string);
    return {
      ...r, case_file: parse(r.case_json), case_json: undefined,
      comparator: d?.comparator ?? null, drift_delta_cents: d?.delta_cents ?? null,
      ripples: hasTable(db, "ripple") ? safe(0, () => (db.prepare("SELECT COUNT(*) AS n FROM ripple WHERE intent_id = ?").get(r.id) as { n: number }).n) : 0,
    };
  });
}

/** The open period the world's date falls in; failing that, the earliest open one. */
function boardPeriod(db: Db, worldDate: string | null): string | null {
  return safe<string | null>(null, () => {
    const hit = worldDate ? (db.prepare("SELECT id FROM period WHERE id = ? AND status <> 'locked'").get(worldDate.slice(0, 7)) as { id: string } | undefined) : undefined;
    if (hit) return hit.id;
    return (db.prepare("SELECT MIN(id) AS p FROM period WHERE status <> 'locked'").get() as { p: string | null }).p;
  });
}

function boards(db: Db): Row {
  const worldDate = safe<string | null>(null, () => worldToday(db));
  const period = boardPeriod(db, worldDate);
  const checklist = period && hasTable(db, "checklist_item") ? safe(null, () => getChecklist(db, period)) : null;
  const latest = hasTable(db, "forecast_version") ? safe(undefined, () => getForecast(db)) : undefined;
  return {
    world_date: worldDate,
    period: period ? safe(null, () => db.prepare("SELECT id, status, locked_at FROM period WHERE id = ?").get(period) ?? null) : null,
    checklist,
    forecast: {
      latest: latest ?? null,
      versions: rows(
        db, "forecast_version",
        `SELECT as_of, as_of_date, version, built_at, reason, cause_event_id, cause_intent_id, opening_cash_cents, inflow_cents, outflow_cents, min_cash_cents, min_cash_week
         FROM forecast_version ORDER BY as_of_date DESC, version DESC LIMIT 12`,
      ),
    },
  };
}

function state(db: Db): unknown {
  return {
    summary: summary(db),
    intents: intentList(db),
    boards: boards(db),
    events: rows(db, "event", "SELECT id, ts, topic, from_function, intent_id, payload_json FROM event ORDER BY id DESC LIMIT 60")
      .map((e) => ({ ...e, payload: parse(e.payload_json), payload_json: undefined })),
    trial_balance: safe<unknown[]>([], () => trialBalance(db)),
  };
}

// ───────────── intent detail: decisions and workpapers

function workpaperFor(db: Db, decisionId: string): Row | null {
  const all = rows(db, "workpaper", "SELECT id, marks_json, kernel_verdict, checkable_num, checkable_den, stale, created_at FROM workpaper WHERE decision_id = ? ORDER BY created_at, rowid", decisionId);
  const latest = all.at(-1);
  if (!latest) return null;
  const body = (parse(latest.marks_json) ?? {}) as { stage?: string; marks?: unknown[]; features?: unknown };
  const stages = all.map((w) => (parse(w.marks_json) as { stage?: string } | null)?.stage ?? "?");
  return { ...latest, marks_json: undefined, stage: body.stage ?? null, marks: Array.isArray(body.marks) ? body.marks : [], features: body.features ?? null, stages };
}

function decisionsFor(db: Db, intentId: string): Row[] {
  return rows(db, "decision", "SELECT * FROM decision WHERE intent_id = ? ORDER BY created_at, rowid", intentId).map((d) => {
    const entry = safe<{ id: string } | undefined>(undefined, () => db.prepare("SELECT id, date, memo, posted_at FROM gl_entry WHERE source_decision_id = ?").get(d.id) as { id: string } | undefined);
    return {
      ...d, proposal: parse(d.proposal_json), proposal_json: undefined,
      workpaper: workpaperFor(db, d.id as string),
      approvals: rows(
        db, "approval",
        `SELECT a.id, a.approver_id, a.approver_kind, a.outcome, a.note, a.approved_at, p.name AS approver_name, p.role AS approver_role
         FROM approval a LEFT JOIN approver p ON p.id = a.approver_id WHERE a.decision_id = ? ORDER BY a.approved_at, a.rowid`,
        d.id,
      ),
      entry: entry ? { ...entry, lines: rows(db, "gl_line", "SELECT line_no, account, debit_cents, credit_cents, party_id FROM gl_line WHERE entry_id = ? ORDER BY line_no", entry.id) } : null,
      steps: rows(db, "decision_step", "SELECT step_no, ts, kind, tier, tool, latency_ms FROM decision_step WHERE decision_id = ? ORDER BY step_no", d.id),
    };
  });
}

function tracesFor(db: Db, caseFile: { trace_ids?: string[] } | null, decisions: Row[]): Row[] {
  const ids = new Set<string>(caseFile?.trace_ids ?? []);
  for (const d of decisions) for (const ev of ((d.proposal as { evidence?: Array<{ trace_id: string }> } | null)?.evidence ?? [])) ids.add(ev.trace_id);
  if (ids.size === 0) return [];
  return rows(
    db, "trace",
    `SELECT id, source, kind, event_time, recorded_time, ingested_at, party_id, version, payload_json FROM trace WHERE id IN (${placeholders(ids.size)})`,
    ...ids,
  ).map((t) => ({ ...t, payload: parse(t.payload_json), payload_json: undefined }));
}

// ───────────── intent detail: the ripple (sheet 30)

interface ScheduleSide { schedule_id: string; version: number; status: string; total_cents: number; lines: Array<{ period: string; amount_cents: number }> }

function scheduleSide(db: Db, contractId: unknown, version: unknown): ScheduleSide | null {
  if (version == null) return null;
  const s = rows(db, "rev_schedule", "SELECT id AS schedule_id, version, status, total_cents FROM rev_schedule WHERE contract_id = ? AND version = ?", contractId, version)[0];
  if (!s) return null;
  const lines = rows(db, "rev_schedule_line", "SELECT period, amount_cents FROM rev_schedule_line WHERE schedule_id = ? ORDER BY period", s.schedule_id);
  return { ...(s as unknown as Omit<ScheduleSide, "lines">), lines: lines as ScheduleSide["lines"] };
}

/** Contract modifications this intent caused, each with the schedule before and after, period by period. */
function modificationsFor(db: Db, intentId: string): Row[] {
  return rows(db, "contract_modification", "SELECT * FROM contract_modification WHERE cause_intent_id = ? ORDER BY created_at, rowid", intentId).map((m) => {
    const [before, after] = [scheduleSide(db, m.contract_id, m.from_version), scheduleSide(db, m.contract_id, m.to_version)];
    const b = new Map((before?.lines ?? []).map((l) => [l.period, l.amount_cents]));
    const a = new Map((after?.lines ?? []).map((l) => [l.period, l.amount_cents]));
    const lines = [...new Set([...b.keys(), ...a.keys()])].sort().map((period) => ({
      period, before_cents: b.get(period) ?? null, after_cents: a.get(period) ?? null, delta_cents: (a.get(period) ?? 0) - (b.get(period) ?? 0),
      recognised: safe("none", () => recognisedStatus(db, m.contract_id as string, period)),
    }));
    return {
      ...m,
      contract: rows(db, "contract", "SELECT id, party_id, start_date, end_date, value_cents FROM contract WHERE id = ?", m.contract_id)[0] ?? null,
      before: before ? { ...before, lines: undefined } : null, after: after ? { ...after, lines: undefined } : null, lines,
    };
  });
}

/** Forecast versions this intent caused, each diffed against the version it replaced. */
function forecastsFor(db: Db, intentId: string, events: Row[]): Row[] {
  const announced = new Map(events.filter((e) => e.topic === "forecast.updated").map((e) => [(e.payload as { as_of?: string } | null)?.as_of, e.payload as Row]));
  return rows(db, "forecast_version", "SELECT * FROM forecast_version WHERE cause_intent_id = ? ORDER BY as_of_date, version", intentId).map((v) => {
    const prior = rows(
      db, "forecast_version",
      "SELECT as_of FROM forecast_version WHERE (as_of_date = ? AND version < ?) OR as_of_date < ? ORDER BY as_of_date DESC, version DESC LIMIT 1",
      v.as_of_date, v.version, v.as_of_date,
    )[0]?.as_of as string | undefined;
    const diff = prior ? safe(null, () => diffVersions(db, prior, v.as_of as string)) : null;
    return {
      ...v, prior_as_of: prior ?? null,
      beyond_horizon: announced.get(v.as_of as string)?.beyond_horizon ?? null,
      diff: diff && {
        delta_inflow_cents: diff.delta_inflow_cents, delta_outflow_cents: diff.delta_outflow_cents, delta_closing_cents: diff.delta_closing_cents,
        inflow_by_week: diff.inflow_by_week, changed_weeks: diff.changed_weeks, by_source_ref: diff.by_source_ref,
      },
    };
  });
}

/** Checklist items this intent moved: its decisions are cited on the item, or the conductor recorded a tick for it. */
function checklistFor(db: Db, decisionIds: string[], ripple: Row[]): Row[] {
  const ticked = new Set(ripple.filter((r) => r.kind === "checklist_tick").map((r) => r.ref as string));
  const mine = new Set(decisionIds);
  return rows(db, "checklist_item", "SELECT id, period, function, name, status, blocked_reason, decision_ids_json FROM checklist_item ORDER BY period, rowid")
    .map((c): Row & { decision_ids: string[] } => ({ ...c, decision_ids: idList(c.decision_ids_json), decision_ids_json: undefined }))
    .filter((c) => ticked.has(c.id as string) || c.decision_ids.some((d) => mine.has(d)));
}

const INTENT_BRIEF = "SELECT id, function, question, status, created_at, closed_at FROM intent WHERE id = ?";

/**
 * Drift cases around this intent. `self`: the difference that opened it. `rippled`: a C1 case this intent's change
 * opened or explained (the drift ripple's ref is the contract the case is keyed on). `cause`: the reverse link, read
 * from a C1 intent back to the intent whose change produced it.
 */
function driftFor(db: Db, intentId: string, ripple: Row[]): Row[] {
  const brief = (id: unknown): Row | null => rows(db, "intent", INTENT_BRIEF, id)[0] ?? null;
  const out: Row[] = rows(db, "drift_case", "SELECT * FROM drift_case WHERE intent_id = ?", intentId).map((c) => ({ ...c, relation: "self", intent: brief(c.intent_id) }));
  const refs = [...new Set(ripple.filter((r) => r.function === "drift").map((r) => r.ref as string))];
  for (const ref of refs) {
    for (const c of rows(db, "drift_case", "SELECT * FROM drift_case WHERE dedupe_key = 'C1_crm_vs_schedule|' || ? AND intent_id <> ?", ref, intentId)) {
      out.push({ ...c, relation: "rippled", intent: brief(c.intent_id) });
    }
  }
  for (const c of out.filter((x) => x.relation === "self" && String(x.comparator).startsWith("C1"))) {
    const contract = String(c.dedupe_key).split("|")[1] ?? "";
    for (const r of rows(db, "ripple", "SELECT DISTINCT intent_id FROM ripple WHERE function = 'drift' AND ref = ? AND intent_id <> ?", contract, intentId)) {
      out.push({ ...c, relation: "cause", intent: brief(r.intent_id) });
    }
  }
  return out;
}

/** The ripple view for one intent: every decision and workpaper, and what the intent changed in each function. */
function intentDetail(db: Db, id: string): unknown {
  const intent = rows(db, "intent", "SELECT * FROM intent WHERE id = ?", id)[0];
  if (!intent) return null;
  const decisions = decisionsFor(db, id);
  const decisionIds = decisions.map((d) => d.id as string);
  const caseFile = parse(intent.case_json) as { trace_ids?: string[] } | null;
  const events = rows(db, "event", "SELECT id, ts, topic, from_function, payload_json FROM event WHERE intent_id = ? ORDER BY id", id)
    .map((e) => ({ ...e, payload: parse(e.payload_json), payload_json: undefined }));
  const ripple = rows(db, "ripple", "SELECT id, function, kind, ref, summary, before_cents, after_cents, delta_cents, event_id, created_at FROM ripple WHERE intent_id = ? ORDER BY id", id);
  return {
    intent: { ...intent, case_file: caseFile, case_json: undefined },
    decisions,
    traces: tracesFor(db, caseFile, decisions),
    artifacts: rows(db, "artifact", "SELECT * FROM artifact WHERE intent_id = ? ORDER BY created_at", id),
    events,
    ripple,
    modifications: modificationsFor(db, id),
    forecasts: forecastsFor(db, id, events),
    checklist: checklistFor(db, decisionIds, ripple),
    mirror: decisionIds.length
      ? rows(db, "mirror_log", `SELECT decision_id, system, kind, external_id, status, detail, mirrored_at FROM mirror_log WHERE decision_id IN (${placeholders(decisionIds.length)}) ORDER BY mirrored_at, rowid`, ...decisionIds)
      : [],
    drift: driftFor(db, id, ripple),
  };
}

// ───────────── http

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

// the schema (contract + lane B) is applied on open, which writes; only then does the connection go read-only
const db = openWorldDb(dbPath());
db.pragma("query_only = ON"); // the console never writes

createServer((req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/state") return send(res, 200, "application/json", JSON.stringify(state(db)));
    if (url.pathname === "/api/intent") {
      const detail = intentDetail(db, url.searchParams.get("id") ?? "");
      return send(res, detail ? 200 : 404, "application/json", JSON.stringify(detail));
    }
    if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", readFileSync(PAGE, "utf8"));
    send(res, 404, "text/plain", "not found");
  } catch (err) {
    send(res, 500, "text/plain", err instanceof Error ? err.message : String(err));
  }
}).listen(PORT, "127.0.0.1", () => process.stdout.write(`Footnote console: http://localhost:${PORT}  (db ${dbPath()})\n`));
