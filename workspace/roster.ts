import { buildFleet, type WorkerRow } from "../src/readmodel/fleet.js";
import { buildRuns } from "../src/readmodel/runs.js";
import type { Db } from "../src/runtime/db.js";

/**
 * Who works here. Every row is something that runs in this system, said for what it is (code, a model, a person), with
 * what this database proves it did this month. An agent that was never needed says so: cheapest first means the
 * expensive ones are often idle, and that is the point. Nothing here is a claim the tables do not back.
 */
/** `group` is how the page sorts the team: the agents that read and reason, the harness that makes them safe and cheap, and people. */
export interface RosterEntry { key: string; group: "agents" | "harness" | "people"; name: string; kind: "code" | "model" | "person"; role: string; did: string; idle: boolean; cost_micros: number | null }

function count(db: Db, sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { n: number } | undefined)?.n ?? 0;
}

function hasTable(db: Db, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function fleetWithRoster(db: Db): unknown {
  const fleet = buildFleet(db);
  return { ...fleet, roster: roster(db, fleet.workers), runs: buildRuns(db) };
}

type Ungrouped = Omit<RosterEntry, "group">;

function roster(db: Db, workers: WorkerRow[]): RosterEntry[] {
  const by = (name: string): WorkerRow | undefined => workers.find((w) => w.worker.startsWith(name));
  const agents: Ungrouped[] = [
    model("haiku", "Investigator · Haiku", "The first model a case meets, on the instructions of whichever function the case belongs to (receivables, or the close's accruals). It investigates with read-only tools over mail, chat, contracts, CRM and memory, and can act only through propose_entry.", by("Haiku")),
    model("sonnet", "Investigator · Sonnet", "Takes a case the first tier could not settle or frame.", by("Sonnet")),
    model("opus", "Investigator · Opus", "The last model tier, for the case nobody cheaper could frame.", by("Opus")),
    accruals(db), controller(db, by("Controller agent")), reader(workers.find((w) => w.lane === "reader")), askAgent()];
  const harness: Ungrouped[] = [kernel(db), codeTier(by("Code tier")), connectors(db), driftMonitor(db), ...engines(db), auditor()];
  return [...agents.map((e) => ({ ...e, group: "agents" as const })), ...harness.map((e) => ({ ...e, group: "harness" as const })), { ...people(by("People")), group: "people" as const }];
}

/** The checker every entry goes through, whoever prepared it. It decides nothing and can create nothing; it can only refuse. */
function kernel(db: Db): Ungrouped {
  const papers = count(db, "SELECT COUNT(*) AS n FROM workpaper");
  const refused = count(db, "SELECT COUNT(*) AS n FROM decision_step WHERE tool = 'propose_entry' AND json_extract(output_json, '$.status') IN ('rejected','blocked')");
  return { key: "kernel", name: "Kernel", kind: "code", role: "Re-performs every proposed entry before it can post: the arithmetic, every quote against its source, who may approve, whether a cited rule or memory really covers it. It decides nothing; it can only refuse.",
    did: papers ? `${plural(papers, "workpaper")} checked, ${plural(refused, "draft")} refused` : "nothing proposed yet", idle: papers === 0, cost_micros: 0 };
}

/** The Ask page's agent. Nothing it does is stored, so there is nothing to count: it reads, and it never writes. */
function askAgent(): Ungrouped {
  return { key: "ask", name: "Ask agent", kind: "model", role: "Answers the CFO in plain words. It picks among ten read-only tools over the books, which are also an MCP server; code computes every number, and it hands anything that changes the books to a person.",
    did: "on the Ask page, and over MCP", idle: false, cost_micros: null };
}

function connectors(db: Db): Ungrouped {
  const rows = db.prepare("SELECT source, COUNT(*) AS n FROM trace WHERE kind != 'human_answer' GROUP BY source ORDER BY n DESC").all() as { source: string; n: number }[];
  const total = rows.reduce((n, r) => n + r.n, 0);
  return { key: "connectors", name: "Connectors", kind: "code", role: "Bring the bank files, mail, chat, contracts and CRM in as evidence, each document hashed so a later edit shows.",
    did: total ? `${plural(total, "document")}: ${rows.map((r) => `${r.source} ${r.n}`).join(", ")}` : "nothing ingested", idle: total === 0, cost_micros: 0 };
}

function driftMonitor(db: Db): Ungrouped {
  const cases = count(db, "SELECT COUNT(*) AS n FROM intent WHERE case_json IS NOT NULL AND owner != 'replay'");
  return { key: "drift", name: "Drift monitor", kind: "code", role: "Compares the bank feed with the ledger and opens a case for every receipt nobody has explained yet.",
    did: `opened ${plural(cases, "case")}`, idle: cases === 0, cost_micros: 0 };
}

function codeTier(w: WorkerRow | undefined): Ungrouped {
  return { key: "code", name: "Learned rules", kind: "code", role: "What the agents and the team have already settled, compiled so it costs nothing the next time: rules induced from past decisions and approved by a person, exact matches, the FX split. Nobody here wrote those rules by hand.",
    did: w ? `${plural(w.posted_alone, "entry", "entries")} posted with no person, ${w.parked} parked` : "has not run", idle: !w, cost_micros: 0 };
}

function reader(w: WorkerRow | undefined): Ungrouped {
  return { key: "reader", name: "Document reader", kind: "model", role: "Our fine-tuned Qwen3-4B reads a remittance into a schema. Code decides whether to believe the reading.",
    did: w ? `${plural(w.turns, "reading")}` : "not on this month's path; its results are on the Model page", idle: !w, cost_micros: w ? w.cost_micros : null };
}

function model(key: string, name: string, role: string, w: WorkerRow | undefined): Ungrouped {
  const did = w ? `${plural(w.turns, "case")}, ${plural(w.tool_calls, "lookup")}, ${plural(w.model_calls, "model call")}${w.kernel_refusals ? `, ${plural(w.kernel_refusals, "draft")} refused by the kernel` : ""}` : "not needed this month";
  return { key, name, kind: "model", role, did, idle: !w, cost_micros: w ? w.cost_micros : null };
}

function controller(db: Db, w: WorkerRow | undefined): Ungrouped {
  const signed = count(db, "SELECT COUNT(*) AS n FROM approval WHERE approver_kind = 'controller_agent'");
  return { key: "controller", name: "Controller agent", kind: "model", role: "An independent reviewer. It may sign only compiled judgment under $500 on a kind of entry with a track record.",
    did: signed || w ? `${plural(signed, "entry", "entries")} signed` : "nothing qualified for its review", idle: !signed && !w, cost_micros: w ? w.cost_micros : null };
}

/** Lane B's engines: plain code that reacts on the bus when the ledger moves. Shown only where their tables exist. */
function engines(db: Db): Ungrouped[] {
  const out: Ungrouped[] = [];
  if (hasTable(db, "rev_schedule")) {
    const n = count(db, "SELECT COUNT(*) AS n FROM rev_schedule");
    const revised = count(db, "SELECT COUNT(*) AS n FROM rev_schedule WHERE version > 1");
    out.push({ key: "revenue", name: "Revenue engine", kind: "code", role: "Builds each contract's revenue schedule and revises it, as a new version, when a concession posts.",
      did: n ? `${plural(n, "schedule")}, ${revised} revised` : "no schedules yet", idle: n === 0, cost_micros: 0 });
  }
  if (hasTable(db, "forecast_line")) {
    const n = count(db, "SELECT COUNT(*) AS n FROM forecast_line");
    out.push({ key: "forecast", name: "Forecast engine", kind: "code", role: "Rebuilds expected receipts by week whenever something upstream of it moves, and says what it does not model.",
      did: n ? `${plural(n, "forecast line")} on file` : "not built yet", idle: n === 0, cost_micros: 0 });
  }
  if (hasTable(db, "checklist_item")) {
    const n = count(db, "SELECT COUNT(*) AS n FROM checklist_item");
    const done = count(db, "SELECT COUNT(*) AS n FROM checklist_item WHERE status = 'done'");
    out.push({ key: "close", name: "Close conductor", kind: "code", role: "Every checklist item is a test on the ledger, re-run after each change. It never takes anyone's word that a step is done.",
      did: n ? `${done} of ${n} checks hold today` : "no checklist yet", idle: n === 0, cost_micros: 0 });
  }
  if (hasTable(db, "mirror_log")) {
    const n = count(db, "SELECT COUNT(*) AS n FROM mirror_log");
    out.push({ key: "mirror", name: "QuickBooks mirror", kind: "code", role: "Writes posted entries into QuickBooks and ties the two books out. A dry run on this machine.",
      did: n ? `${plural(n, "step")} logged` : "nothing mirrored from here", idle: n === 0, cost_micros: 0 });
  }
  return out;
}

/** The close pack: the one place in the close where there is reading to do, not only arithmetic. */
function accruals(db: Db): Ungrouped {
  const posted = count(db, "SELECT COUNT(*) AS n FROM decision WHERE mode = 'live' AND kind = 'accrual' AND posted_at IS NOT NULL");
  const parked = count(db, "SELECT COUNT(*) AS n FROM decision d WHERE d.mode = 'live' AND d.kind = 'accrual' AND d.route = 'PROPOSE' AND d.posted_at IS NULL AND NOT EXISTS (SELECT 1 FROM approval a WHERE a.decision_id = d.id AND a.outcome = 'rejected')");
  const cases = count(db, "SELECT COUNT(*) AS n FROM intent WHERE function = 'close' AND case_json IS NOT NULL AND json_extract(case_json, '$.accrual.account') IS NOT NULL");
  return { key: "accruals", name: "Accruals agent", kind: "model", role: "Finds recurring expenses nobody has billed for the month. Code estimates a steady one from the ledger; one that moves is read from the vendor's own words, never averaged.",
    did: cases ? `${plural(cases, "unbilled expense")} found, ${posted} posted, ${parked} waiting for a person` : "has not looked yet: Close, Find unbilled expenses", idle: cases === 0, cost_micros: null };
}

function auditor(): Ungrouped {
  return { key: "auditor", name: "Auditor", kind: "code", role: "Re-performs a risk-weighted sample as of the day each entry posted. It cannot read the preparer's memory and cannot write.",
    did: "on demand, from the Close page", idle: false, cost_micros: 0 };
}

function people(w: WorkerRow | undefined): Ungrouped {
  return { key: "people", name: "People", kind: "person", role: "Asked only when the agents are blocked. What they say is kept as evidence and remembered with a scope and an end date.",
    did: w ? `${plural(w.turns, "decision")} this month` : "nothing has needed a person's decision yet", idle: !w, cost_micros: null };
}
