/** Every document the agents can find, as people actually write them. `party_id: null` is company-wide. */
export interface SeedDoc { id: string; source: "gmail" | "slack" | "contract" | "file"; kind: string; party_id: string | null; at: string; payload: Record<string, string> }

export const CEO_QUOTE = "Confirming what we discussed: Halvorsen gets 10% off the platform fee through renewal on 2027-06-30.";
export const TDS_QUOTE = "tax has been deducted at source at 10% (USD 1,800.00) and deposited with the Government of India";
export const PAYER_QUOTE = "invoices addressed to Kestrel Analytics Ltd will be paid by our parent company, Kestrel Group Holdings plc";
export const MEMO_TDS_QUOTE = "Tax deducted at source by a customer under local law is not a discount and not an expense";

export const DOCUMENTS: SeedDoc[] = [
  { id: "tr_mail_halvorsen_1", source: "gmail", kind: "email", party_id: "halvorsen", at: "2026-06-26T14:12:00Z", payload: {
    from: "pat.lindqvist@halvorsenfreight.test", to: "morgan.hale@northwind.test", subject: "Renewal pricing",
    body: "Morgan, good to talk today. As discussed, the May outage cost us two days of dispatch reporting and my board wants to see that reflected before we sign the renewal. Can you confirm the discount in writing so I can get the order form through? Pat Lindqvist, CFO, Halvorsen Freight Systems" } },
  { id: "tr_mail_halvorsen_2", source: "gmail", kind: "email", party_id: "halvorsen", at: "2026-06-28T15:00:00Z", payload: {
    from: "morgan.hale@northwind.test", to: "pat.lindqvist@halvorsenfreight.test", subject: "Re: Renewal pricing",
    body: `Hi Pat, ${CEO_QUOTE} Billing will not catch up for a cycle or two, so invoices may still show the list price. Pay the net amount and we will true it up on our side. Thanks, Morgan Hale, CEO` } },
  { id: "tr_contract_halvorsen", source: "contract", kind: "order_form", party_id: "halvorsen", at: "2025-07-01T00:00:00Z", payload: {
    title: "Order form NW-HAL-2025", text: "Platform fee USD 12,000 per month, billed monthly in advance, net 30. Term 1 July 2025 to 30 June 2027. Section 4: no discount or credit is effective unless agreed in writing by an officer of Northwind." } },

  { id: "tr_mail_meridian_1", source: "gmail", kind: "email", party_id: "meridian", at: "2026-07-17T06:30:00Z", payload: {
    from: "accounts.payable@meridianinfotech.test", to: "ar-apac@northwind.test", subject: "Remittance advice: INV-3151",
    body: `Dear Northwind AR team, we have remitted USD 16,200.00 today against invoice INV-3151 for USD 18,000.00. As required under Section 195 of the Income-tax Act, ${TDS_QUOTE}. Form 16A for the quarter will follow by 15 August. Regards, Accounts Payable, Meridian Infotech Pvt Ltd` } },
  { id: "tr_contract_meridian", source: "contract", kind: "order_form", party_id: "meridian", at: "2026-01-01T00:00:00Z", payload: {
    title: "Order form NW-MER-2026 (Northwind Systems Pte Ltd)", text: "Platform fee USD 18,000 per month, billed monthly in advance, net 30, payable in US dollars. Term 1 January 2026 to 31 December 2027. Fees are exclusive of taxes; where the customer is required by law to withhold tax it shall provide the official certificate within 60 days." } },

  { id: "tr_mail_brightwater_1", source: "gmail", kind: "email", party_id: "brightwater", at: "2026-07-16T13:05:00Z", payload: {
    from: "ap-inquiries@brightwaterhealth.test", to: "ar@northwind.test", subject: "Remittance advice: payment 07/16/2026",
    body: "Payment amount USD 29,700.00 by ACH, trace 071000013345512. Invoice INV-3161, gross 33,000.00, deduction 3,300.00, reason code 07 (service credit per account team), net 29,700.00. Questions: ap-inquiries@brightwaterhealth.test" } },
  { id: "tr_slack_brightwater_1", source: "slack", kind: "message", party_id: "brightwater", at: "2026-06-18T16:00:00Z", payload: {
    channel: "#cs-escalations", user: "sam", text: "Brightwater's SSO rollout failed again this morning. Their CIO is not happy. I am on a call with them at 3." } },
  { id: "tr_contract_brightwater", source: "contract", kind: "order_form", party_id: "brightwater", at: "2025-01-01T00:00:00Z", payload: {
    title: "Order form NW-BWH-2025", text: "Platform fee USD 33,000 per month, billed monthly in advance, net 30. Section 4: service credits are at Northwind's discretion and are effective only when confirmed in writing by an officer of Northwind." } },

  { id: "tr_mail_kestrel_1", source: "gmail", kind: "email", party_id: "kestrel-analytics", at: "2026-06-30T09:40:00Z", payload: {
    from: "ap@kestrelanalytics.test", to: "ar-emea@northwind.test", subject: "Change of paying entity from July",
    body: `Hello, following our treasury centralisation, ${PAYER_QUOTE}, starting with the July invoice. Payments will show KESTREL GROUP HOLDINGS PLC as the originator. Invoice addressing does not change. Kestrel Analytics Accounts Payable` } },

  { id: "tr_mail_castellan_1", source: "gmail", kind: "email", party_id: "castellan", at: "2026-07-17T15:20:00Z", payload: {
    from: "kreditoren@castellanbiotech.test", to: "ar-emea@northwind.test", subject: "Zahlungsavis / payment advice",
    body: "2026-07-18 WIRE RMT76314 CASTELLAN BIOTECH AG USD 8,494.98 INV-3182:3,000.00 INV-3183:5,494.98" } },

  { id: "tr_policy_memo", source: "file", kind: "policy_memo", party_id: null, at: "2026-01-02T00:00:00Z", payload: {
    title: "Northwind accounting policy memo FY2026",
    text: `Adjustments of USD 500 or more require approval by a person in the approval matrix. Account owners may approve customer credits up to USD 5,000; the controller up to USD 100,000. Price concessions on subscriptions still being delivered reduce deferred revenue (2400). Charges deducted by intermediary banks on international wires are written off to bank charges (6150) only under an approved rule; otherwise ask. ${MEMO_TDS_QUOTE}: settle it against the invoice to Withholding tax receivable (1350), and obtain the withholding certificate so the credit can be claimed. A customer may pay from another legal entity only once that entity is confirmed in writing and recorded.` } },
  { id: "tr_mail_noise_1", source: "gmail", kind: "email", party_id: null, at: "2026-07-05T08:00:00Z", payload: {
    from: "events@saasconf.test", to: "morgan.hale@northwind.test", subject: "Early bird discount ends Friday", body: "Get 20% off your conference pass through Friday." } },
  { id: "tr_mail_noise_2", source: "gmail", kind: "email", party_id: "halvorsen", at: "2026-07-02T09:00:00Z", payload: {
    from: "ap@halvorsenfreight.test", to: "ar@northwind.test", subject: "Invoice INV-3141", body: "We have INV-3141 in our queue for the 12 July run." } },
];

/** Q2: what the team did with intermediary bank charges on international wires. One was coded to the wrong account. */
export const Q2_WIRE_FEES: { id: string; party_id: string; cents: number; account: string; day: string }[] = [
  { id: "dp_q2_1", party_id: "ostrander", cents: 1500, account: "6150", day: "2026-04-14" },
  { id: "dp_q2_2", party_id: "ardent", cents: 2500, account: "6150", day: "2026-04-20" },
  { id: "dp_q2_3", party_id: "ostrander", cents: 3500, account: "6150", day: "2026-05-15" },
  { id: "dp_q2_4", party_id: "fernhill", cents: 2000, account: "6990", day: "2026-05-19" },
  { id: "dp_q2_5", party_id: "ardent", cents: 4500, account: "6150", day: "2026-06-16" },
  { id: "dp_q2_6", party_id: "fernhill", cents: 1000, account: "6150", day: "2026-06-18" },
];
