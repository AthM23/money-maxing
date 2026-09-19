// Tool-name registry from PROJECT_SPEC.md §8. Same names in replay and live; local stores first, live
// systems swapped in behind them. `owner` is who implements the tool under the two-person roadmap.
// Changed only with both people in the conversation.

type ToolDef = { readonly name: string; readonly access: 'read' | 'write'; readonly scope: 'shared' | 'function' | 'all'; readonly owner: 'A' | 'B' };

const t = <N extends string>(name: N, access: ToolDef['access'], scope: ToolDef['scope'], owner: ToolDef['owner']) =>
  ({ name, access, scope, owner }) as const satisfies ToolDef;

export const TOOLS = {
  // shared read
  LEDGER_OPEN_INVOICES: t('ledger.open_invoices', 'read', 'shared', 'B'),
  LEDGER_GET_INVOICE: t('ledger.get_invoice', 'read', 'shared', 'B'),
  LEDGER_PARTY_HISTORY: t('ledger.party_history', 'read', 'shared', 'B'),
  LEDGER_TRIAL_BALANCE: t('ledger.trial_balance', 'read', 'shared', 'B'),
  LEDGER_ACCOUNT_ACTIVITY: t('ledger.account_activity', 'read', 'shared', 'B'),
  BANK_GET_TRANSACTION: t('bank.get_transaction', 'read', 'shared', 'B'),
  BANK_UNMATCHED: t('bank.unmatched', 'read', 'shared', 'B'),
  MAIL_SEARCH: t('mail.search', 'read', 'shared', 'B'),
  MAIL_GET_THREAD: t('mail.get_thread', 'read', 'shared', 'B'),
  CHAT_SEARCH: t('chat.search', 'read', 'shared', 'B'),
  CONTRACTS_GET: t('contracts.get', 'read', 'shared', 'B'),
  CONTRACTS_FIND_CLAUSE: t('contracts.find_clause', 'read', 'shared', 'B'),
  CRM_OWNER: t('crm.owner', 'read', 'shared', 'B'),
  CRM_NOTES: t('crm.notes', 'read', 'shared', 'B'),
  POLICY_MEMO_LOOKUP: t('policy_memo.lookup', 'read', 'shared', 'B'),
  WORKBOOK_LOOKUP: t('workbook.lookup', 'read', 'shared', 'B'),
  // memory is fenced off from the auditor (board README, "Auditor independence")
  MEMORY_FACTS: t('memory.facts', 'read', 'shared', 'A'),
  MEMORY_POLICIES: t('memory.policies', 'read', 'shared', 'A'),
  MEMORY_SIMILAR_DECISIONS: t('memory.similar_decisions', 'read', 'shared', 'A'),
  // function read
  AP_BILLS: t('ap.bills', 'read', 'function', 'B'),
  AP_PO: t('ap.po', 'read', 'function', 'B'),
  AP_RECEIPT: t('ap.receipt', 'read', 'function', 'B'),
  AP_VENDOR_HISTORY: t('ap.vendor_history', 'read', 'function', 'B'),
  REV_SCHEDULE: t('rev.schedule', 'read', 'function', 'B'),
  CLOSE_CHECKLIST: t('close.checklist', 'read', 'function', 'B'),
  FORECAST_GET: t('forecast.get', 'read', 'function', 'B'),
  AUDIT_SAMPLE: t('audit.sample', 'read', 'function', 'A'),
  AUDIT_RERUN_KERNEL: t('audit.rerun_kernel', 'read', 'function', 'A'),
  AUDIT_CONTROL_TEST: t('audit.control_test', 'read', 'function', 'A'),
  REPORT_VARIANCE: t('report.variance', 'read', 'function', 'B'),
  // write, all functions. Only propose_entry can reach the ledger.
  PROPOSE_ENTRY: t('propose_entry', 'write', 'all', 'A'),
  ESCALATE: t('escalate', 'write', 'all', 'A'),
  HANDOFF: t('handoff', 'write', 'all', 'A'),
  CLOSE_MARK: t('close.mark', 'write', 'all', 'B'),
  RECORD_FACT_CANDIDATE: t('record_fact_candidate', 'write', 'all', 'A'),
  FINISH: t('finish', 'write', 'all', 'A'),
} as const;

export type ToolName = (typeof TOOLS)[keyof typeof TOOLS]['name'];

export const ALL_TOOLS: readonly ToolDef[] = Object.values(TOOLS);
export const ALL_TOOL_NAMES: readonly ToolName[] = Object.values(TOOLS).map((d) => d.name);

/** Tools the audit agent may never be given: it re-performs without the preparer's memory. */
export const AUDITOR_DENIED_TOOLS: readonly ToolName[] = [
  TOOLS.MEMORY_FACTS.name,
  TOOLS.MEMORY_POLICIES.name,
  TOOLS.MEMORY_SIMILAR_DECISIONS.name,
];

/**
 * The Messages API tool-name pattern is [a-zA-Z0-9_-]; the spec names carry dots. One mapping, used by every loop
 * (Agent SDK or the Vercel AI SDK fallback), so traces and the console always show the spec name.
 */
export function toMcpName(name: ToolName): string {
  return name.replace(/\./g, '__');
}
export function fromMcpName(mcp: string): ToolName | undefined {
  const name = mcp.replace(/__/g, '.');
  return (ALL_TOOL_NAMES as readonly string[]).includes(name) ? (name as ToolName) : undefined;
}
