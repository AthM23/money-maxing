import type { ToolEnv } from "../agents/env.js";
import { callTool, type ToolCallResult } from "../agents/toolset.js";
import { AUDITOR_DENIED_TOOLS, WRITE_TOOLS } from "../contract/tools.js";

/**
 * `finish` only ends the run and writes nothing, so the auditor keeps it. Every other write tool goes:
 * the auditor reads the record, it never adds to it.
 */
const KEPT_WRITE_TOOLS: readonly string[] = ["finish"];

/**
 * The read tools an auditor needs, by registry name: the ledger, the source documents behind an
 * entry, the written policy, the bank line, and the audit tools themselves.
 *
 * Deliberately NOT here: `memory.*`, which would tell the auditor why the preparer thought it was
 * fine; `workbook.lookup`, which holds the preparer's own reviewer comments; `crm.owner`, which is
 * who to ask rather than what the record says. An auditor who needs one of those asks a person.
 */
const AUDITOR_READS: readonly string[] = [
  "ledger.open_invoices", "ledger.get_invoice", "ledger.party_history", "ledger.trial_balance", "ledger.account_activity",
  "bank.get_transaction",
  "mail.search", "mail.get_thread", "chat.search",
  "contracts.get", "contracts.find_clause",
  "crm.notes",
  "policy_memo.lookup",
  "audit.sample", "audit.rerun_kernel", "audit.control_test",
];

/** The registry spells a tool `memory.facts`; the agent toolset spells the same tool `memory_facts`. */
function spellings(name: string): string[] {
  return [name, name.replaceAll(".", "_")];
}

/**
 * Auditor independence as the list of names the tool layer ALLOWS, not a list of the ones it has
 * thought to refuse. A prompt can be argued with and a deny-list is only as current as the last
 * person to remember it: a tool added tomorrow is refused here by default, which is the only way
 * this holds. It covers both spellings so neither layer is a way round.
 */
export const AUDITOR_ALLOW_LIST: ReadonlySet<string> = new Set([
  ...AUDITOR_READS.flatMap(spellings),
  // The toolset's own name for the tool the registry calls `mail.get_thread`.
  "read_trace",
  ...KEPT_WRITE_TOOLS,
]);

/**
 * The auditor's door to the toolset. A refused tool comes back as a refused result the model can read,
 * never as a throw and never as silence — and it is refused before `callTool`, so nothing is metered
 * against the decision and no preparer memory is touched on the way past.
 */
export function auditorCallTool(env: ToolEnv, tool: string, input: unknown): ToolCallResult {
  if (AUDITOR_ALLOW_LIST.has(tool)) return callTool(env, tool, input);
  return {
    ok: false,
    output: {
      error: `auditor independence: ${tool} is outside the auditor's allow-list`,
      reason: refusalReason(tool),
    },
  };
}

function refusalReason(tool: string): string {
  if (isWriteTool(tool)) return "the auditor reads the record and never writes to it";
  if (isPreparerMemory(tool)) return "preparer memory would tell the auditor why the preparer thought it was fine";
  return "the allow-list is the read tools an auditor needs; anything else is preparer-side, or unknown to this fence";
}

function isWriteTool(tool: string): boolean {
  return WRITE_TOOLS.some((name) => spellings(name).includes(tool));
}

function isPreparerMemory(tool: string): boolean {
  return AUDITOR_DENIED_TOOLS.some((name) => spellings(name).includes(tool));
}
