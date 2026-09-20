import type { KernelVerdict } from "../contract/types.js";

/**
 * What an audit finding can be. Re-performance raises the first four; the control tests raise the rest.
 * The type is the thing a reviewer sorts by, so it is a closed list, never free text.
 */
export type FindingType =
  | "kernel_disagrees"
  | "ledger_mismatch"
  | "evidence_invalidated"
  | "approval_defect"
  | "duplicate_vendor"
  | "round_number_payment"
  | "post_lock_entry"
  | "self_approval"
  | "just_under_threshold"
  | "split_transaction";

/** The ids a person needs to pull the item and look at it themselves. Every finding carries at least one. */
export interface FindingRefs {
  decision_id?: string;
  entry_id?: string;
  trace_id?: string;
  approver_id?: string;
  party_id?: string;
  bank_txn_id?: string;
  period?: string;
  doc_ids?: string[];
  party_ids?: string[];
  decision_ids?: string[];
}

export interface Finding {
  type: FindingType;
  detail: string;
  refs: FindingRefs;
}

/** A decision whose proposal no longer reads, or that was never posted live, cannot be re-performed. */
export type RerunVerdict = KernelVerdict | "unreadable";

export interface RerunResult {
  decision_id: string;
  /** The verdict this re-performance reached on its own. */
  fresh_verdict: RerunVerdict;
  /** The verdict the preparer's last workpaper recorded. */
  stored_verdict: KernelVerdict | null;
  /** State put back to how it stood at posting, so the entry is not faulted for its own effects. */
  neutralised: string[];
  findings: Finding[];
}

export type Stratum = "must_test" | "random";

export interface SampleItem {
  decision_id: string;
  stratum: Stratum;
  /** Why this item is in the sample. A must-test item may have several reasons. */
  reasons: string[];
}

export interface Sample {
  period: string;
  seed: string;
  materiality_cents: number;
  population_size: number;
  must_test: SampleItem[];
  random: SampleItem[];
}

/** Reported, never a finding: how much of the period an agent signed off for another agent. */
export interface AgentApprovedShare {
  posted: number;
  agent_approved: number;
  share: number;
}

export interface ControlTestResults {
  findings: Finding[];
  agent_approved: AgentApprovedShare;
}

export interface PackSummary {
  sampled: number;
  reperformed_clean: number;
  reperformed_clean_share: number;
  findings_total: number;
  findings_by_type: Partial<Record<FindingType, number>>;
}

export interface AuditPack {
  period: string;
  seed: string;
  materiality_cents: number;
  population_size: number;
  sample: Sample;
  reperformance: RerunResult[];
  controls: ControlTestResults;
  summary: PackSummary;
}
