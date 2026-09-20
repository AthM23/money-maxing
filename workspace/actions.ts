import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { decideHeldAmount } from "../src/agents/decideHold.js";
import { recordHumanAnswer } from "../src/agents/humanLoop.js";
import { buildAuditPack } from "../src/audit/pack.js";
import { rebuildLadder } from "../src/learn/autonomy.js";
import { approvePolicy, compilePolicies } from "../src/learn/compile.js";
import { replay } from "../src/learn/replay.js";
import { approveFact, rejectFact } from "../src/memory/facts.js";
import { APP_CONFIG } from "../src/packs/index.js";
import { approveDecision } from "../src/runtime/approve.js";
import { systemClock } from "../src/runtime/config.js";
import { openDb, type Db } from "../src/runtime/db.js";
import { runOpenIntents } from "../src/worker/runOpenIntents.js";
import { HttpError } from "./http.js";
import { ask, AskHistory, ASK_MODELS, runTool } from "./ask.js";

/**
 * Everything the workspace can change, and each of them goes through the same functions the command line and Slack
 * use: an approval is `approveDecision` and the kernel's post gate, an answer is `recordHumanAnswer`. The page has no
 * write path of its own. Who is acting comes from the page; what they may do is decided by the approval matrix, in code.
 */
const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_:.-]+$/);
const Approve = z.object({ decision_id: Id, as: Id, outcome: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() });
const Answer = z.object({
  escalation_id: Id, as: Id, treatment: z.enum(["credit_memo", "write_off", "tax_withholding", "dispute_hold", "chase"]), text: z.string().min(3).max(1000),
  uses: z.enum(["one_time", "standing"]), valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pct_off: z.number().min(0).max(100).optional(), pct_withheld: z.number().min(0).max(100).optional(),
});
const Decide = z.object({
  decision_id: Id, as: Id, treatment: z.enum(["credit_memo", "write_off", "tax_withholding", "chase"]), text: z.string().min(3).max(1000),
  uses: z.enum(["one_time", "standing"]), valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pct_off: z.number().min(0).max(100).optional(), pct_withheld: z.number().min(0).max(100).optional(),
});
const FactAction = z.object({ fact_id: Id, as: Id, outcome: z.enum(["approved", "rejected"]) });
const PolicyAction = z.object({ policy_id: Id, as: Id });
const Run = z.object({ intent_id: Id.optional() });
const Audit = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), tamper: z.boolean().optional() });
const Ask = z.object({ question: z.string().min(2).max(300), period: z.string().regex(/^\d{4}-\d{2}$/), model: z.enum(ASK_MODELS).default("code"), history: AskHistory });
const Tool = z.object({ name: Id, input: z.unknown().optional(), period: z.string().regex(/^\d{4}-\d{2}$/) });

type Handler = (db: Db, body: unknown) => Promise<unknown> | unknown;

export const ACTIONS: Record<string, Handler> = {
  approve: (db, body) => {
    const a = parse(Approve, body);
    return approveDecision(db, a.decision_id, { approver_id: a.as, approver_kind: "human", outcome: a.outcome, note: a.note }, { config: APP_CONFIG });
  },
  answer: (db, body) => {
    const { escalation_id, as, ...answer } = parse(Answer, body);
    return recordHumanAnswer(db, escalation_id, as, answer, { config: APP_CONFIG });
  },
  // A hold an agent parked is a person's to decide: their decision is recorded as a question put to them and their answer.
  decide: (db, body) => {
    const { decision_id, as, ...answer } = parse(Decide, body);
    return decideHeldAmount(db, decision_id, as, answer, { config: APP_CONFIG });
  },
  fact: (db, body) => {
    const f = parse(FactAction, body);
    return f.outcome === "approved" ? approveFact(db, systemClock, f.fact_id, f.as) : rejectFact(db, systemClock, f.fact_id, f.as);
  },
  learn: async (db) => {
    const before = await replay(db, { investigators: [], function: "ar" });
    const drafts = compilePolicies(db, systemClock, "ar");
    return { replayed: before.length, agreed: before.filter((r) => r.diff.agrees).length, drafts, ladder: rebuildLadder(db, systemClock) };
  },
  policy: async (db, body) => {
    const p = parse(PolicyAction, body);
    const result = approvePolicy(db, systemClock, p.policy_id, p.as);
    if (result.status !== "approved") return result;
    // The rule only earns the right to post on its own once replay shows it agreeing with what people booked.
    const after = await replay(db, { investigators: [], function: "ar" });
    return { ...result, replayed: after.length, agreed: after.filter((r) => r.diff.agrees).length, ladder: rebuildLadder(db, systemClock) };
  },
  run: async (db, body) => {
    const r = parse(Run, body);
    // The code tier only: instant and free. Model tiers take minutes and cost money, so they are run from the terminal.
    const report = await runOpenIntents(db, { investigators: [], config: APP_CONFIG, intent_id: r.intent_id });
    return { worked: report.worked.map((w) => ({ intent_id: w.intent_id, routes: w.routes, status: w.status, elapsed_ms: w.elapsed_ms })), skipped: report.skipped.length };
  },
  // Reads only. It is a POST because it carries a question, and it changes nothing.
  ask: (db, body) => {
    const a = parse(Ask, body);
    return ask(db, a.question, a.period, a.model, a.history);
  },
  // One tool, run directly: a tile on the Ask page, or any client that speaks the same registry.
  tool: (db, body) => {
    const t = parse(Tool, body);
    return runTool(db, t.name, t.input, t.period);
  },
  audit: async (db, body) => {
    const a = parse(Audit, body);
    const clean = buildAuditPack(db, systemClock, { period: a.period, seed: "workspace", size: 50 });
    const result = { summary: clean.summary, population: clean.population_size, findings: findingsOf(clean) };
    return a.tamper ? { ...result, tampered: await tamperedAudit(db, a.period) } : result;
  },
};

/**
 * The same audit on a copy of the books in which one digit of one cited source has been changed. The live database is
 * never touched: the copy lives in a temporary folder and is deleted afterwards.
 */
async function tamperedAudit(db: Db, period: string): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), "workspace-audit-"));
  try {
    const copyPath = join(dir, "copy.db");
    await db.backup(copyPath);
    const copy = openDb(copyPath);
    const target = copy
      .prepare(
        `SELECT t.id, t.payload_json FROM trace t WHERE t.payload_json GLOB '*[0-9].[0-9][0-9][0-9][0-9]*' AND EXISTS (
           SELECT 1 FROM decision d, json_each(json_extract(d.proposal_json, '$.evidence')) e
           WHERE d.mode = 'live' AND d.posted_at IS NOT NULL AND e.value ->> '$.trace_id' = t.id) ORDER BY t.recorded_time DESC LIMIT 1`,
      )
      .get() as { id: string; payload_json: string } | undefined;
    if (!target) return { changed: null, note: "no posted entry cites a source with a rate in it" };
    const rate = /\d\.\d{4}/.exec(target.payload_json)?.[0] ?? "";
    const swapped = `${rate.slice(0, -1)}${rate.endsWith("9") ? "1" : "9"}`;
    copy.prepare("UPDATE trace SET payload_json = replace(payload_json, ?, ?) WHERE id = ?").run(rate, swapped, target.id);
    const pack = buildAuditPack(copy, systemClock, { period, seed: "workspace-tamper", size: 50 });
    copy.close();
    return { changed: { trace_id: target.id, from: rate, to: swapped }, summary: pack.summary, findings: findingsOf(pack) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every finding in the pack, from re-performance and from the control tests, capped for the page. */
function findingsOf(pack: ReturnType<typeof buildAuditPack>): unknown[] {
  return [...pack.reperformance.flatMap((r) => r.findings), ...pack.controls.findings].slice(0, 20);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return result.data;
}
