import { Proposal, type Mark } from "../../contract/types.js";
import { approveDecision } from "../../runtime/approve.js";
import type { Db } from "../../runtime/db.js";
import { safeJson } from "../../runtime/lookups.js";
import { recordHumanAnswer } from "../humanLoop.js";
import { approveFact, factCandidates, rejectFact } from "../../memory/facts.js";
import { systemClock } from "../../runtime/config.js";
import { getTrace } from "../../runtime/lookups.js";
import { answerModal, approvalBlocks, escalationBlocks, factBlocks, type EscalationQuestion } from "./blocks.js";
import { APP_CONFIG } from "../../packs/index.js";

interface Action { action_id: string; value: string }
interface InteractiveBody {
  type: string; trigger_id?: string; user: { id: string }; actions?: Action[];
  view?: { private_metadata: string; state: { values: Record<string, Record<string, { value?: string; selected_date?: string; selected_option?: { value: string } }>> } };
}

/**
 * Slack over Socket Mode: button clicks arrive on a WebSocket, so no tunnel or public URL is needed.
 * Needs SLACK_BOT_TOKEN (xoxb) and SLACK_APP_TOKEN (xapp, connections:write). Every answer and approval still goes
 * through recordHumanAnswer and approveDecision, so the identity checks and the kernel's post gate apply unchanged.
 */
export async function startSlack(db: Db): Promise<{ postEscalation: typeof postEscalation; postApproval: typeof postApproval; postFact: typeof postFact; stop(): Promise<void> }> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!botToken || !appToken) throw new Error("SLACK_BOT_TOKEN and SLACK_APP_TOKEN must be set to start the Slack transport");
  const { WebClient } = await import("@slack/web-api");
  const { SocketModeClient } = await import("@slack/socket-mode");
  const web = new WebClient(botToken);
  const socket = new SocketModeClient({ appToken });

  socket.on("interactive", async ({ body, ack }: { body: InteractiveBody; ack: () => Promise<void> }) => {
    await ack();
    try {
      await handleInteractive(db, web, body);
    } catch (err) {
      process.stderr.write(`slack interactive handler failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });
  await socket.start();

  async function postEscalation(escalationId: string): Promise<string | undefined> {
    const row = db.prepare("SELECT asked_user, question_json FROM escalation WHERE id = ?").get(escalationId) as { asked_user: string; question_json: string } | undefined;
    if (!row) return undefined;
    const q = safeJson(row.question_json) as EscalationQuestion;
    const res = await web.chat.postMessage({ channel: row.asked_user, text: q.what_happened, blocks: escalationBlocks(escalationId, q) as never });
    if (res.ts) db.prepare("UPDATE escalation SET slack_ts = ? WHERE id = ?").run(res.ts, escalationId);
    return res.ts;
  }

  async function postApproval(decisionId: string, approverSlackUser: string, controllerNote?: string): Promise<string | undefined> {
    const row = db.prepare("SELECT proposal_json FROM decision WHERE id = ?").get(decisionId) as { proposal_json: string } | undefined;
    const proposal = row ? Proposal.safeParse(safeJson(row.proposal_json)) : null;
    if (!proposal?.success) return undefined;
    const wp = db.prepare("SELECT marks_json FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1").get(decisionId) as { marks_json: string } | undefined;
    const marks = ((safeJson(wp?.marks_json ?? "{}") as { marks?: Mark[] } | null)?.marks) ?? [];
    const res = await web.chat.postMessage({ channel: approverSlackUser, text: `Approval needed: ${proposal.data.kind}`, blocks: approvalBlocks(decisionId, proposal.data, marks, controllerNote) as never });
    return res.ts;
  }

  async function postFact(factId: string, approverSlackUser: string): Promise<string | undefined> {
    const fact = factCandidates(db).find((f) => f.id === factId);
    if (!fact) return undefined;
    const quotes = fact.source_trace_ids.flatMap((id) => { const t = getTrace(db, id); return t ? [t.payload_text.slice(0, 400)] : []; });
    const res = await web.chat.postMessage({ channel: approverSlackUser, text: `Remember this about ${fact.party_id}?`, blocks: factBlocks({ ...fact, quotes }) as never });
    return res.ts;
  }

  return { postEscalation, postApproval, postFact, stop: () => socket.disconnect() };
}

async function handleInteractive(db: Db, web: { views: { open(args: never): Promise<unknown> }; chat: { postMessage(args: never): Promise<unknown> } }, body: InteractiveBody): Promise<void> {
  const action = body.actions?.[0];
  if (body.type === "block_actions" && action?.action_id.startsWith("answer:") && body.trigger_id) {
    await web.views.open({ trigger_id: body.trigger_id, view: answerModal(action.value, action.action_id.slice("answer:".length)) } as never);
    return;
  }
  if (body.type === "block_actions" && action && (action.action_id === "approve" || action.action_id === "reject")) {
    const approver = approverFor(db, body.user.id, askedToApprove(db, action.value));
    const result = approveDecision(db, action.value, { approver_id: approver, approver_kind: "human", outcome: action.action_id === "approve" ? "approved" : "rejected" }, { config: APP_CONFIG });
    await web.chat.postMessage({ channel: body.user.id, text: describe(result) } as never);
    return;
  }
  if (body.type === "block_actions" && action && (action.action_id === "fact_approve" || action.action_id === "fact_reject")) {
    const result = action.action_id === "fact_approve" ? approveFact(db, systemClock, action.value, approverFor(db, body.user.id)) : rejectFact(db, systemClock, action.value, approverFor(db, body.user.id));
    const said = result.status === "active" ? "Remembered. It applies from now, within your limit and its end date."
      : result.status === "rejected" ? "Not remembered." : `Nothing changed (${result.status}${"reason" in result ? `: ${result.reason}` : ""}).`;
    await web.chat.postMessage({ channel: body.user.id, text: said } as never);
    return;
  }
  if (body.type === "view_submission" && body.view) {
    const meta = safeJson(body.view.private_metadata) as { escalation_id: string; treatment: string };
    const values = body.view.state.values;
    const out = recordHumanAnswer(db, meta.escalation_id, approverFor(db, body.user.id, askedToAnswer(db, meta.escalation_id)), {
      treatment: meta.treatment, text: values.why?.text?.value ?? "", uses: values.uses?.uses?.selected_option?.value ?? "one_time",
      valid_to: values.expiry?.date?.selected_date ?? undefined,
      ...(values.rate?.pct?.value?.trim() ? { [meta.treatment === "tax_withholding" ? "pct_withheld" : "pct_off"]: Number(values.rate.pct.value) } : {}),
    });
    await web.chat.postMessage({ channel: body.user.id, text: out.status === "answered" ? "Saved. I won't ask this again for cases it covers." : `Not saved: ${out.status}` } as never);
  }
}

/**
 * Map a Slack user to the approval matrix. Someone not in the matrix is passed through and refused downstream. In a
 * demo workspace one real Slack user can stand for several people; taking the first row made every click the CFO's.
 * The click belongs to the person who was asked (the desk records that on the decision, a question carries it), if
 * this Slack user is them. Where that cannot be told, the most limited of the people this user stands for signs,
 * never the most senior.
 */
export function approverFor(db: Db, slackUser: string, asked?: string | null): string {
  const people = db.prepare("SELECT id FROM approver WHERE slack_user = ? ORDER BY limit_cents, id").all(slackUser) as { id: string }[];
  if (people.length <= 1) return people[0]?.id ?? slackUser;
  return people.find((p) => p.id === asked)?.id ?? people[0]!.id;
}

/** Who the desk asked to approve this decision, from the decision's own timeline. */
export function askedToApprove(db: Db, decisionId: string): string | null {
  const row = db.prepare("SELECT json_extract(output_json, '$.approver_id') AS id FROM decision_step WHERE decision_id = ? AND kind = 'human_request' ORDER BY step_no DESC LIMIT 1").get(decisionId) as { id: string | null } | undefined;
  return row?.id ?? null;
}

/** Who a question was put to. */
function askedToAnswer(db: Db, escalationId: string): string | null {
  return (db.prepare("SELECT asked_user FROM escalation WHERE id = ?").get(escalationId) as { asked_user: string } | undefined)?.asked_user ?? null;
}

function describe(result: ReturnType<typeof approveDecision>): string {
  if (result.status === "posted") return "Posted. The kernel re-checked it at the post gate with your approval.";
  if (result.status === "blocked") return `Blocked by rule ${result.rule}. Your approval cannot lift this; it is recorded.`;
  if (result.status === "rejected") return `The post gate rejected it: ${result.failed.map((m) => m.check).join(", ")}.`;
  return `Nothing posted (${result.status}).`;
}
