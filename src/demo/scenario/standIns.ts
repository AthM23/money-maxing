import { ACCOUNTS } from "../../contract/accounts.js";
import type { CaseFile } from "../../contract/types.js";
import type { InvestigationReport, Investigator, ToolCaller } from "../../agents/investigator.js";
import { CEO_QUOTE, MEMO_TDS_QUOTE, PAYER_QUOTE, TDS_QUOTE } from "./documents.js";

/**
 * Stand-ins for the model tiers in the rehearsal: NOT models. Each does through the tools what a real tier did in
 * tonight's paid runs (search, read, quote, propose, remember, or ask), so the harness is exercised end to end with
 * no model call. They can only act through `call`, exactly like the real investigators.
 */
export const standIn: Investigator = {
  name: "stand-in",
  async investigate(task, call): Promise<InvestigationReport> {
    const play = PLAYS[task.case_file.party_id];
    if (!play) return { outcome: "refused", summary: "nothing on file explains this case", places_looked: ["mail_search"] };
    return play(task.case_file, call);
  },
};

type Play = (c: CaseFile, call: ToolCaller) => InvestigationReport;

const settle = (c: CaseFile, kind: "credit_memo" | "write_off" | "tax_withholding", account: string, memo: string, evidence: { claim: string; trace_id: string; quote: string }[]) => ({
  intent_id: c.intent_id, function: "ar", kind, party_id: c.party_id, entry_date: c.entry_date,
  applications: [{ doc_id: c.doc_ids[0], amount_cents: c.shortfall_cents }],
  entries: [{ account, debit_cents: c.shortfall_cents, credit_cents: 0, memo }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: c.shortfall_cents, memo }],
  evidence, policy_refs: [], fact_refs: [], judgment: [],
});

const PLAYS: Record<string, Play> = {
  halvorsen: (c, call) => {
    call("mail_search", { query: "Halvorsen discount renewal", party_id: c.party_id });
    call("propose_entry", { ...settle(c, "credit_memo", ACCOUNTS.deferred_revenue, "10% concession per CEO, 28 June", [{ claim: "the CEO granted 10% off through renewal", trace_id: "tr_mail_halvorsen_2", quote: CEO_QUOTE }]),
      terms_change: { pct_off: 10, until: "2027-06-30" } });
    call("record_fact_candidate", { party_id: c.party_id, predicate: "concession_pct", value: { pct_off: 10 }, kinds: ["credit_memo"], uses: "standing",
      valid_from: "2026-06-28", valid_to: "2027-06-30", source_trace_ids: ["tr_mail_halvorsen_2"], stated_by: "morgan.hale@northwind.test" });
    return { outcome: "proposed", summary: "the CEO's email of 28 June explains the 10%", places_looked: ["mail_search"] };
  },
  meridian: (c, call) => {
    call("mail_search", { query: "remittance advice tax deducted at source", party_id: c.party_id });
    call("policy_memo_lookup", { query: "tax deducted at source withholding", party_id: c.party_id });
    call("propose_entry", settle(c, "tax_withholding", ACCOUNTS.wht_receivable, "India TDS u/s 195 per remittance advice", [
      { claim: "the customer deducted 10% tax at source and will send Form 16A", trace_id: "tr_mail_meridian_1", quote: TDS_QUOTE },
      { claim: "policy: withheld tax is a receivable, not a discount", trace_id: "tr_policy_memo", quote: MEMO_TDS_QUOTE }]));
    call("record_fact_candidate", { party_id: c.party_id, predicate: "withholding_tax_pct", value: { pct_withheld: 10 }, kinds: ["tax_withholding"], uses: "standing",
      valid_from: "2026-07-01", valid_to: "2027-12-31", source_trace_ids: ["tr_mail_meridian_1"], stated_by: "accounts.payable@meridianinfotech.test" });
    return { outcome: "proposed", summary: "not a short-pay: tax withheld at source in India", places_looked: ["mail_search", "policy_memo_lookup"] };
  },
  brightwater: (c, call) => {
    const looked = ["mail_search", "chat_search", "contracts_find_clause"].map((tool) => ({ source: tool, query: "Brightwater service credit", hits: (call(tool, { query: "Brightwater service credit", party_id: c.party_id }).output as unknown[]).length }));
    const owner = call("crm_owner", { party_id: c.party_id }).output as { owner_user: string };
    call("escalate", { asked_user: owner.owner_user, party_id: c.party_id, predicate: "shortfall_reason", decision_kind: "credit_memo",
      what_happened: "Brightwater paid $29,700.00 on a $33,000.00 invoice and its remittance claims a $3,300.00 service credit per the account team (reason code 07).",
      what_was_checked: looked, what_is_unknown: "Whether an officer of Northwind agreed this credit in writing, as section 4 of the order form requires.",
      treatments: [{ id: "credit_memo", label: "Yes, an agreed credit" }, { id: "dispute_hold", label: "Hold it as disputed" }, { id: "chase", label: "No, collect the $3,300" }] });
    return { outcome: "escalated", summary: "a claimed deduction nobody here agreed to in writing", places_looked: looked.map((l) => l.source) };
  },
  "kestrel-analytics": (c, call) => {
    call("mail_search", { query: "Kestrel paying entity parent", party_id: c.party_id });
    call("record_fact_candidate", { party_id: c.party_id, predicate: "parent_pays", value: { payer_party_id: "kestrel-group", note: PAYER_QUOTE }, kinds: ["apply_payment"],
      uses: "standing", valid_from: "2026-07-01", valid_to: "2027-06-30", source_trace_ids: ["tr_mail_kestrel_1"], stated_by: "ap@kestrelanalytics.test" });
    return { outcome: "refused", summary: "the parent paid; the customer's own email says so, but nobody here has confirmed the payer yet", places_looked: ["mail_search"] };
  },
  vossberg: (c, call) => {
    const looked = ["mail_search", "chat_search", "contracts_find_clause"].map((tool) => ({ source: tool, query: "Vossberg outage credit", hits: (call(tool, { query: "Vossberg outage credit", party_id: c.party_id }).output as unknown[]).length }));
    const owner = call("crm_owner", { party_id: c.party_id }).output as { owner_user: string };
    call("escalate", { asked_user: owner.owner_user, party_id: c.party_id, predicate: "shortfall_reason", decision_kind: "credit_memo",
      what_happened: "Vossberg withheld part of an invoice for the June outage. The bank fee and the rate difference on the receipt are already booked; what they held back is still open.",
      what_was_checked: looked, what_is_unknown: "Whether an officer has agreed a service credit for the June outage in writing, as section 7 of the order form requires, and whether it stands for later invoices.",
      treatments: [{ id: "credit_memo", label: "Yes, an agreed SLA credit" }, { id: "dispute_hold", label: "Hold it as disputed" }, { id: "chase", label: "No, collect it" }] });
    return { outcome: "escalated", summary: "the outage happened; nobody with authority has agreed a credit", places_looked: looked.map((l) => l.source) };
  },
  ardent: (c, call) => {
    call("bank_get_transaction", { bank_txn_id: c.bank_txn_id });
    call("propose_entry", settle(c, "write_off", ACCOUNTS.bank_charges, "Correspondent bank charge deducted in transit", [
      { claim: "the correspondent bank deducted USD 60.00 in transit", trace_id: c.trace_ids[0]!, quote: "CHGS:BEN CORRESPONDENT DED USD 60.00" }]));
    return { outcome: "proposed", summary: "a correspondent charge above the rule's ceiling", places_looked: ["bank_get_transaction"] };
  },
};
