import { ACCOUNTS } from "../contract/accounts.js";
import { safeJson } from "../runtime/lookups.js";

/** Loose shape read off a stored proposal_json for display. Full validation belongs to settledBy.ts, which needs the whole Proposal. */
interface ProposalShape {
  entry_date?: string;
  party_id?: string;
  applications?: { amount_cents?: number }[];
  entries?: { account?: string; debit_cents?: number; credit_cents?: number }[];
}

const CONTROL_ACCOUNTS = new Set<string>([ACCOUNTS.cash, ACCOUNTS.ar, ACCOUNTS.ap]);

function readProposal(proposalJson: string | null): ProposalShape | null {
  return proposalJson ? (safeJson(proposalJson) as ProposalShape | null) : null;
}

export function entryDateOf(proposalJson: string | null): string {
  return readProposal(proposalJson)?.entry_date ?? "";
}

export function partyIdOf(proposalJson: string | null): string {
  return readProposal(proposalJson)?.party_id ?? "";
}

/**
 * What this entry actually moved: cash applied to documents, or whatever it debited or credited outside the
 * control accounts (a write-off, a credit memo, cash nobody could apply). Mirrors the kernel's own adjustment
 * amount (kernel/util.ts adjustmentCents) without needing a full KernelContext.
 */
export function judgmentCentsOf(proposalJson: string | null): number {
  const proposal = readProposal(proposalJson);
  if (!proposal) return 0;
  const applied = (proposal.applications ?? []).reduce((n, a) => n + (a.amount_cents ?? 0), 0);
  const outside = (proposal.entries ?? []).filter((l) => l.account !== undefined && !CONTROL_ACCOUNTS.has(l.account));
  const outsideCents = Math.max(
    outside.reduce((n, l) => n + (l.debit_cents ?? 0), 0),
    outside.reduce((n, l) => n + (l.credit_cents ?? 0), 0),
  );
  return Math.max(applied, outsideCents);
}
