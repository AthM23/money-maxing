import type { HumanOutcome, Proposal } from "../contract/types.js";
import { ACCOUNTS } from "../contract/accounts.js";

export interface OutcomeDiff {
  agrees: boolean;
  mismatches: Array<"kind" | "account" | "amount" | "docs" | "no_proposal">;
  agent: { kind: string; account: string | null; amount_cents: number; doc_ids: string[] } | null;
  human: HumanOutcome;
}

const CONTROL: ReadonlySet<string> = new Set([ACCOUNTS.cash, ACCOUNTS.ar, ACCOUNTS.ap]);

/** Compare what the agent proposed with what the humans booked. Pure code; the agent never sees the human side. */
export function compareOutcome(proposal: Proposal | null, human: HumanOutcome): OutcomeDiff {
  if (!proposal) return { agrees: false, mismatches: ["no_proposal"], agent: null, human };
  const agent = summarise(proposal);
  const mismatches: OutcomeDiff["mismatches"] = [];
  if (agent.kind !== human.kind) mismatches.push("kind");
  if ((human.account ?? null) !== agent.account) mismatches.push("account");
  if (agent.amount_cents !== human.amount_cents) mismatches.push("amount");
  if ([...agent.doc_ids].sort().join(",") !== [...human.doc_ids].sort().join(",")) mismatches.push("docs");
  return { agrees: mismatches.length === 0, mismatches, agent, human };
}

/** The judgment account is the line that is not cash and not a control account; the amount is what was applied. */
export function summarise(p: Proposal): NonNullable<OutcomeDiff["agent"]> {
  const judgmentLine = p.entries.find((l) => !CONTROL.has(l.account));
  const amount = p.applications.reduce((n, a) => n + a.amount_cents, 0);
  return { kind: p.kind, account: judgmentLine?.account ?? null, amount_cents: amount, doc_ids: p.applications.map((a) => a.doc_id) };
}
