/** Tool-name registry (spec §8). Same names in replay and live; only the backend differs. */
export const READ_TOOLS = [
  "ledger.open_invoices", "ledger.get_invoice", "ledger.party_history", "ledger.trial_balance", "ledger.account_activity",
  "bank.get_transaction", "bank.unmatched",
  "mail.search", "mail.get_thread", "chat.search",
  "contracts.get", "contracts.find_clause",
  "crm.owner", "crm.notes",
  "policy_memo.lookup", "workbook.lookup",
  "memory.facts", "memory.policies", "memory.similar_decisions",
  "ap.bills", "ap.po", "ap.receipt", "ap.vendor_history",
  "rev.schedule", "close.checklist", "forecast.get",
  "audit.sample", "audit.rerun_kernel", "audit.control_test",
  "report.variance",
] as const;

/** The only tools that change anything. `propose_entry` is the single write path to the ledger. */
export const WRITE_TOOLS = [
  "propose_entry", "escalate", "handoff", "close.mark", "record_fact_candidate", "finish",
] as const;

export type ReadTool = (typeof READ_TOOLS)[number];
export type WriteTool = (typeof WRITE_TOOLS)[number];
export type ToolName = ReadTool | WriteTool;

/** The auditor is fenced off from preparer memory (board README, auditor independence). */
export const AUDITOR_DENIED_TOOLS: readonly ToolName[] = ["memory.facts", "memory.policies", "memory.similar_decisions"];
