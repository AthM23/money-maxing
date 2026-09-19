// event.topic vocabulary: the 50 canonical topics from context/diagrams/architecture/EVENT_TOPICS.md §(a).
// Naming rule: function.object.verb_past. Changed only with both people in the conversation.

export const TOPICS = {
  // ingestion and context
  INGEST_COMMITTED: 'ingest.committed',
  INGEST_REFUSED: 'ingest.refused',
  EVIDENCE_REVERSIONED: 'evidence.reversioned',
  BOARD_CONSENT_INGESTED: 'board.consent_ingested',
  CRM_DEAL_CLOSED_WON: 'crm.deal.closed_won',
  HR_DEPARTURE_DETECTED: 'hr.departure_detected',
  // drift monitor
  DRIFT_EXPLAINED: 'drift.explained',
  DRIFT_LOGGED_IMMATERIAL: 'drift.logged_immaterial',
  DRIFT_UPDATED: 'drift.updated',
  // human loop and memory
  HUMAN_ESCALATION_OPENED: 'human.escalation.opened',
  HUMAN_ESCALATION_ANSWERED: 'human.escalation.answered',
  FACT_ACTIVATED: 'fact.activated',
  // shared post step
  ENTRY_POSTED: 'entry.posted',
  ENTRY_BLOCKED: 'entry.blocked',
  // AR
  AR_CREDIT_MEMO_POSTED: 'ar.credit_memo.posted',
  AR_PAYMENT_APPLIED: 'ar.payment.applied',
  AR_DISPUTE_OPENED: 'ar.dispute.opened',
  AR_UNAPPLIED_CASH: 'ar.unapplied_cash',
  AR_RECEIVABLE_REOPENED: 'ar.receivable.reopened',
  // AP
  AP_BILL_APPROVED: 'ap.bill.approved',
  AP_BILL_HELD: 'ap.bill.held',
  AP_PAYMENT_SCHEDULED: 'ap.payment.scheduled',
  AP_VENDOR_CHANGE_REQUESTED: 'ap.vendor.change_requested',
  // bank rec
  BANKREC_UNMATCHED: 'bankrec.unmatched',
  BANKREC_REVERSAL_DETECTED: 'bankrec.reversal_detected',
  BANKREC_RECONCILED: 'bankrec.reconciled',
  BANKREC_STALE: 'bankrec.stale',
  // revenue and billing
  REV_SCHEDULE_REVISED: 'rev.schedule.revised',
  REV_RECOGNISED: 'rev.recognised',
  REV_LEAKAGE_FOUND: 'rev.leakage.found',
  REV_INVOICE_ISSUED: 'rev.invoice_issued',
  BILLING_EXPECTATION_CHANGED: 'billing.expectation.changed',
  // close
  CLOSE_ACCRUAL_POSTED: 'close.accrual.posted',
  CLOSE_TB_FINAL: 'close.tb.final',
  CLOSE_PERIOD_LOCKED: 'close.period.locked',
  CLOSE_OUT_OF_PERIOD: 'close.out_of_period',
  // forecast
  FORECAST_UPDATED: 'forecast.updated',
  FORECAST_MISS_CLASSIFIED: 'forecast.miss.classified',
  FORECAST_MIN_CASH_BREACH: 'forecast.min_cash.breach',
  // reporting
  REPORT_FLUX_CLEARED: 'report.flux.cleared',
  REPORT_FLUX_UNEXPLAINED: 'report.flux.unexplained',
  REPORT_PACK_PUBLISHED: 'report.pack.published',
  // audit
  AUDIT_FINDING_RAISED: 'audit.finding.raised',
  AUDIT_PACK_READY: 'audit.pack.ready',
  AUDIT_EVIDENCE_INVALIDATED: 'audit.evidence.invalidated',
  // equity-lite
  EQUITY_FORFEITURE: 'equity.forfeiture',
  EQUITY_EXPENSE_REVISED: 'equity.expense_revised',
  EQUITY_EXERCISE_EXPECTED: 'equity.exercise_expected',
  EQUITY_NSO_EXERCISE: 'equity.nso_exercise',
  EQUITY_COMPLIANCE_FLAG: 'equity.compliance_flag',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export const ALL_TOPICS: readonly Topic[] = Object.values(TOPICS);

const TOPIC_SET: ReadonlySet<string> = new Set(ALL_TOPICS);
export function isTopic(s: string): s is Topic {
  return TOPIC_SET.has(s);
}
