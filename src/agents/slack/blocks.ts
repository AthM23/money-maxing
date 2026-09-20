import type { Mark, Proposal } from "../../contract/types.js";

/** Slack Block Kit payloads, built as plain data so they can be tested without a workspace. */
export type Block = Record<string, unknown>;

export interface EscalationQuestion {
  what_happened: string;
  what_was_checked: { source: string; query: string; hits: number }[];
  what_is_unknown: string;
  treatments: { id: string; label: string }[];
  prior_answer?: Record<string, unknown>;
}

const dollars = (cents: number): string => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Slack refuses the whole message if a button label passes 75 characters or a section passes 3,000. */
const BUTTON_MAX = 75;
const SECTION_MAX = 2900;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function escalationBlocks(escalationId: string, q: EscalationQuestion): Block[] {
  const checked = q.what_was_checked.map((c) => `• ${c.source}: “${c.query}” → ${c.hits} hit${c.hits === 1 ? "" : "s"}`).join("\n");
  const prior = q.prior_answer ? `\n*Last time you said:* ${String(q.prior_answer.text ?? JSON.stringify(q.prior_answer))}` : "";
  return [
    { type: "section", text: { type: "mrkdwn", text: clip(`*I'm blocked and need one thing from you.*\n${q.what_happened}${prior}`, SECTION_MAX) } },
    { type: "section", text: { type: "mrkdwn", text: clip(`*What I checked*\n${checked}`, SECTION_MAX) } },
    { type: "section", text: { type: "mrkdwn", text: clip(`*What I don't know*\n${q.what_is_unknown}`, SECTION_MAX) } },
    {
      type: "actions", block_id: `esc:${escalationId}`,
      elements: q.treatments.map((t) => ({ type: "button", text: { type: "plain_text", text: clip(t.label, BUTTON_MAX) }, action_id: `answer:${t.id}`, value: escalationId })),
    },
    { type: "context", elements: [{ type: "mrkdwn", text: "If nobody answers, the balance stays open as a dispute hold. Nothing is written off on a guess." }] },
  ];
}

/** The modal that follows a button: one line for the record, and whether this is one-time or standing. */
export function answerModal(escalationId: string, treatment: string): Block {
  return {
    type: "modal", callback_id: "answer_submit", private_metadata: JSON.stringify({ escalation_id: escalationId, treatment }),
    title: { type: "plain_text", text: "For the record" }, submit: { type: "plain_text", text: "Save" },
    blocks: [
      { type: "input", block_id: "why", label: { type: "plain_text", text: "What was agreed, and with whom?" },
        element: { type: "plain_text_input", action_id: "text", multiline: true } },
      { type: "input", block_id: "uses", label: { type: "plain_text", text: "Does it apply again?" },
        element: { type: "radio_buttons", action_id: "uses", initial_option: option("one_time", "One time only"),
          options: [option("one_time", "One time only"), option("standing", "Standing, until an end date")] } },
    ],
  };
}

export function approvalBlocks(decisionId: string, proposal: Proposal, marks: Mark[], controllerNote?: string): Block[] {
  const lines = proposal.entries.map((l) => `• ${l.account}  Dr ${dollars(l.debit_cents)}  Cr ${dollars(l.credit_cents)}  ${l.memo}`).join("\n");
  const tally = (["F", "E", "P", "J"] as const)
    .map((cls) => `${cls} ${marks.filter((m) => m.cls === cls && m.status === "pass").length}/${marks.filter((m) => m.cls === cls).length}`).join(" · ");
  const quotes = proposal.evidence.filter((e) => e.quote).map((e) => `> ${e.quote}\n_${e.claim} (${e.trace_id})_`).join("\n");
  return [
    { type: "section", text: { type: "mrkdwn", text: clip(`*Approval needed:* ${proposal.kind.replaceAll("_", " ")} for ${proposal.party_id}\n${lines}`, SECTION_MAX) } },
    { type: "section", text: { type: "mrkdwn", text: clip(`*Kernel re-checked the workpaper:* ${tally}\n${quotes}`, SECTION_MAX) } },
    ...(controllerNote ? [{ type: "context", elements: [{ type: "mrkdwn", text: clip(`Controller agent: ${controllerNote}`, SECTION_MAX) }] }] : []),
    {
      type: "actions", block_id: `apr:${decisionId}`,
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "approve", value: decisionId },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Reject" }, action_id: "reject", value: decisionId },
      ],
    },
  ];
}

function option(value: string, text: string): Block {
  return { text: { type: "plain_text", text }, value };
}
