import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { dbPath, openWorldDb, type Db } from "../src/ledger/db.js";
import { bankUnmatched, trialBalance } from "../src/ledger/read.js";
import { readControlTotals } from "../src/runtime/kernelContext.js";

/**
 * Console v0: one page polling SQLite through a read-only JSON API. No framework and no build step, so it runs
 * wherever the database is. `pnpm console` → http://localhost:4317
 */
const PORT = Number(process.env.FOOTNOTE_CONSOLE_PORT ?? 4317);
const PAGE = fileURLToPath(new URL("./index.html", import.meta.url));

const parse = (s: string | null): unknown => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

function state(db: Db): unknown {
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  const control = readControlTotals(db);
  const intents = (db.prepare(
    `SELECT i.id, i.function, i.question, i.status, i.created_at, i.closed_at, i.case_json,
            (SELECT GROUP_CONCAT(d.route, '+') FROM decision d WHERE d.intent_id = i.id AND d.route IS NOT NULL) AS routes,
            (SELECT MAX(d.tier) FROM decision d WHERE d.intent_id = i.id) AS tier,
            (SELECT COUNT(*) FROM artifact a WHERE a.intent_id = i.id) AS artifacts
     FROM intent i WHERE i.owner NOT IN ('seed','replay') ORDER BY i.created_at DESC, i.id LIMIT 200`,
  ).all() as Array<Record<string, unknown>>).map((r) => ({ ...r, case_file: parse(r.case_json as string | null), case_json: undefined }));
  return {
    summary: {
      traces: db.prepare("SELECT source, COUNT(*) AS n FROM trace GROUP BY source ORDER BY source").all(),
      bank_lines: count("SELECT COUNT(*) AS n FROM bank_txn"),
      bank_unmatched: bankUnmatched(db).length,
      intents_open: count("SELECT COUNT(*) AS n FROM intent WHERE status IN ('open','waiting_on_human') AND owner NOT IN ('seed','replay')"),
      intents_resolved: count("SELECT COUNT(*) AS n FROM intent WHERE status = 'resolved' AND owner NOT IN ('seed','replay')"),
      routes: db.prepare("SELECT route, COUNT(*) AS n FROM decision WHERE route IS NOT NULL AND mode = 'live' GROUP BY route").all(),
      model_calls: count("SELECT COALESCE(SUM(model_calls), 0) AS n FROM decision WHERE mode = 'live'"),
      ar_gl_cents: control.ar_gl_cents, ar_subledger_cents: control.ar_subledger_cents,
      ap_gl_cents: control.ap_gl_cents, ap_subledger_cents: control.ap_subledger_cents,
    },
    intents,
    events: (db.prepare("SELECT id, ts, topic, from_function, intent_id, payload_json FROM event ORDER BY id DESC LIMIT 60").all() as Array<Record<string, unknown>>)
      .map((e) => ({ ...e, payload: parse(e.payload_json as string), payload_json: undefined })),
    trial_balance: trialBalance(db),
  };
}

/** The ripple view for one intent: every decision, its workpaper, the entry it posted, artifacts and events. */
function intentDetail(db: Db, id: string): unknown {
  const intent = db.prepare("SELECT * FROM intent WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!intent) return null;
  const decisions = (db.prepare("SELECT * FROM decision WHERE intent_id = ? ORDER BY created_at, rowid").all(id) as Array<Record<string, unknown>>).map((d) => {
    const wp = db.prepare("SELECT marks_json, kernel_verdict, checkable_num, checkable_den FROM workpaper WHERE decision_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(d.id) as Record<string, unknown> | undefined;
    const entry = db.prepare("SELECT id, date, memo, posted_at FROM gl_entry WHERE source_decision_id = ?").get(d.id) as { id: string } | undefined;
    return {
      ...d, proposal: parse(d.proposal_json as string | null), proposal_json: undefined,
      workpaper: wp ? { ...wp, ...(parse(wp.marks_json as string) as { stage?: string; marks?: unknown[] } | null ?? { marks: [] }), marks_json: undefined } : null,
      entry: entry ? { ...entry, lines: db.prepare("SELECT line_no, account, debit_cents, credit_cents, party_id FROM gl_line WHERE entry_id = ? ORDER BY line_no").all(entry.id) } : null,
      steps: db.prepare("SELECT step_no, ts, kind, tier, tool, latency_ms FROM decision_step WHERE decision_id = ? ORDER BY step_no").all(d.id),
    };
  });
  const caseFile = parse(intent.case_json as string | null) as { trace_ids?: string[] } | null;
  const traceIds = new Set<string>(caseFile?.trace_ids ?? []);
  for (const d of decisions) for (const ev of ((d.proposal as { evidence?: Array<{ trace_id: string }> } | null)?.evidence ?? [])) traceIds.add(ev.trace_id);
  const traces = [...traceIds].map((t) => db.prepare("SELECT id, source, kind, event_time, recorded_time, ingested_at, party_id, version, payload_json FROM trace WHERE id = ?").get(t) as Record<string, unknown> | undefined)
    .filter((t): t is Record<string, unknown> => Boolean(t)).map((t) => ({ ...t, payload: parse(t.payload_json as string), payload_json: undefined }));
  return {
    intent: { ...intent, case_file: caseFile, case_json: undefined },
    decisions, traces,
    artifacts: db.prepare("SELECT * FROM artifact WHERE intent_id = ? ORDER BY created_at").all(id),
    events: (db.prepare("SELECT id, ts, topic, from_function, payload_json FROM event WHERE intent_id = ? ORDER BY id").all(id) as Array<Record<string, unknown>>)
      .map((e) => ({ ...e, payload: parse(e.payload_json as string), payload_json: undefined })),
  };
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

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
}).listen(PORT, () => process.stdout.write(`Footnote console: http://localhost:${PORT}  (db ${dbPath()})\n`));
