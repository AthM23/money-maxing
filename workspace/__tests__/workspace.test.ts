import { describe, expect, it } from "vitest";
import { buildFleet } from "../../src/readmodel/fleet.js";
import { buildCaseTrace } from "../../src/readmodel/trace.js";
import { ACTIONS } from "../actions.js";
import { HttpError } from "../http.js";
import { caseView, overview, workpaperView } from "../views.js";
import { learnedWorld, workedWorld } from "./world.js";

interface Line { kind: string; amount_cents: number; state: string; decision_id: string | null; fx_note: string | null; account: string | null }
const linesOf = (view: unknown): Line[] => (view as { lines: Line[] }).lines;

describe("the workspace reads one receipt the way a cash application reads", () => {
  it("the bank line is explained to the cent by book lines: cash, the bank's charges, realized FX, and what is still open", async () => {
    const db = await workedWorld();
    const lines = linesOf(caseView(db, "int_main"));
    expect(lines.map((l) => `${l.kind}:${l.amount_cents}:${l.state}`)).toEqual(["apply_payment:10580000:posted", "write_off:4000:posted", "fx_realized:196000:posted", "open:220000:open"]);
    expect(lines.reduce((n, l) => n + l.amount_cents, 0)).toBe(11000000);
    expect(lines[0]).toMatchObject({ account: "1000", fx_note: "EUR→USD · 1.0800" });
    expect(caseView(db, "int_nope")).toBeNull();
  });

  it("an entry's evidence comes with the text of its source and the offsets of the quote inside it", async () => {
    const db = await workedWorld();
    const fx = linesOf(caseView(db, "int_main")).find((l) => l.kind === "fx_realized")!;
    const view = workpaperView(db, fx.decision_id!) as { workpaper: { evidence: { trace_id: string; quote: string; offset: { start: number; end: number } }[] }; sources: Record<string, { text: string }> };
    for (const e of view.workpaper.evidence) expect(view.sources[e.trace_id]!.text.slice(e.offset.start, e.offset.end)).toBe(e.quote);
    expect(view.workpaper.evidence.map((e) => e.quote)).toContain("Amount received EUR 98,000.00");
  });
});

describe("the trace of a case, and of the whole month", () => {
  it("shows every turn in order: code posting, the model's lookups, the question, and nothing posted by a model alone", async () => {
    const db = await workedWorld();
    const trace = buildCaseTrace(db, "int_main");
    expect(trace.spans.filter((s) => s.lane === "code" && s.outcome === "posted, no person involved").map((s) => s.kind)).toEqual(["apply_payment", "write_off", "fx_realized"]);
    const models = trace.spans.filter((s) => s.lane === "model");
    expect(models.length).toBeGreaterThan(0);
    expect(models.flatMap((s) => s.steps).some((st) => st.kind === "tool")).toBe(true);
    expect(trace.totals).toMatchObject({ questions: 1, posted: 3 });
    expect(models.every((s) => !s.outcome.startsWith("posted"))).toBe(true);
  });

  it("the fleet view adds up what each kind of worker did", async () => {
    const db = await workedWorld();
    const fleet = buildFleet(db);
    const code = fleet.workers.find((w) => w.worker === "Code tier")!;
    expect(code.posted_alone).toBeGreaterThanOrEqual(14);
    expect(code.cost_micros).toBe(0);
    expect(fleet.feed.some((f) => f.what === "asked a person one question" && f.party === "vossberg")).toBe(true);
  });
});

describe("what the page can change goes through the same functions as the command line and Slack", () => {
  it("run, answer as the CFO, approve as the controller: the invoice is paid and the answer is remembered", async () => {
    const db = await learnedWorld();
    const ran = await ACTIONS.run!(db, {}) as { worked: { intent_id: string; routes: string[] }[] };
    expect(ran.worked.find((w) => w.intent_id === "int_main")?.routes).toEqual(["AUTO", "AUTO", "AUTO"]);

    const worked = await workedWorld();
    const question = (overview(worked, "Test") as { awaiting_you: { open_questions: { escalation_id: string; intent_id: string }[] } }).awaiting_you.open_questions.find((q) => q.intent_id === "int_main" || q.intent_id === "int_addon")!;
    const answered = await ACTIONS.answer!(worked, { escalation_id: question.escalation_id, as: "U_CFO", treatment: "credit_memo", uses: "standing", valid_to: "2026-09-30", pct_off: 2,
      text: "Agreed with their ops director: a 2% SLA credit for the June outage." }) as { status: string; fact_status: string; proposal: { decision_id: string } };
    expect(answered).toMatchObject({ status: "answered", fact_status: "active" });
    expect(await ACTIONS.approve!(worked, { decision_id: answered.proposal.decision_id, as: "U_CTRL", outcome: "approved" })).toMatchObject({ status: "posted" });
    expect(worked.prepare("SELECT open_cents FROM invoice WHERE id = 'INV-3201'").get()).toEqual({ open_cents: 0 });
  });

  it("refuses input that is not what it expects, by name, and never touches the books for the tampered audit", async () => {
    const db = await workedWorld();
    expect(() => ACTIONS.approve!(db, { decision_id: "x; DROP TABLE decision", as: "U_CTRL", outcome: "approved" })).toThrow(HttpError);
    expect(() => ACTIONS.answer!(db, { escalation_id: "esc_1", as: "U_CFO", treatment: "give_it_away", uses: "standing", text: "ok" })).toThrow(/treatment/);

    const before = db.prepare("SELECT payload_json FROM trace WHERE id = 'tr_advice_BTX-320'").get();
    const audit = await ACTIONS.audit!(db, { period: "2026-07", tamper: true }) as { summary: { findings_total: number }; tampered: { changed: { from: string; to: string }; summary: { findings_total: number } } };
    expect(audit.summary.findings_total).toBe(0);
    expect(audit.tampered.changed.from).not.toBe(audit.tampered.changed.to);
    expect(audit.tampered.summary.findings_total).toBeGreaterThan(0);
    expect(db.prepare("SELECT payload_json FROM trace WHERE id = 'tr_advice_BTX-320'").get()).toEqual(before);
  });
});
