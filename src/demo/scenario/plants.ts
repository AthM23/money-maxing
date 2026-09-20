import type { CaseFile } from "../../contract/types.js";

/**
 * The global July, as data. Northwind Systems invoices in US dollars worldwide from three legal entities and is paid
 * into four bank accounts at three banks. Every receipt below is a shape Maximor's customers describe (Kiteworks:
 * many entities, banks and country rules; their close-assessment: one payment for several invoices, small
 * short-pays). Lane B's seeder can import this file as it stands; ids and cents are what the rehearsal test asserts.
 */
export const ENTITIES = {
  inc: { name: "Northwind Systems Inc", country: "US" },
  ltd: { name: "Northwind Systems Ltd", country: "GB" },
  pte: { name: "Northwind Systems Pte Ltd", country: "SG" },
} as const;

export const BANK_ACCOUNTS = {
  jpm_operating: { entity: "inc", label: "JPMorgan Chase USD operating ··4417" },
  jpm_lockbox: { entity: "inc", label: "JPMorgan Chase USD lockbox ··4425" },
  hsbc_uk: { entity: "ltd", label: "HSBC UK USD ··0193" },
  dbs_sg: { entity: "pte", label: "DBS Singapore USD ··8834" },
} as const;

export interface Customer { id: string; name: string; country: string; owner: string; parent_id?: string; billed_by: keyof typeof ENTITIES }

export const CUSTOMERS: Customer[] = [
  { id: "pallister", name: "Pallister Manufacturing Inc", country: "US", owner: "U_DANA", billed_by: "inc" },
  { id: "tessellate", name: "Tessellate Software Inc", country: "US", owner: "U_DANA", billed_by: "inc" },
  { id: "ostrander", name: "Ostrander Imports BV", country: "NL", owner: "U_SAM", billed_by: "ltd" },
  { id: "ardent", name: "Ardent Aerospace GmbH", country: "DE", owner: "U_SAM", billed_by: "ltd" },
  { id: "fernhill", name: "Fernhill Foods Ltd", country: "IE", owner: "U_SAM", billed_by: "ltd" },
  { id: "halvorsen", name: "Halvorsen Freight Systems", country: "US", owner: "U_DANA", billed_by: "inc" },
  { id: "meridian", name: "Meridian Infotech Pvt Ltd", country: "IN", owner: "U_SAM", billed_by: "pte" },
  { id: "brightwater", name: "Brightwater Health Partners", country: "US", owner: "U_SAM", billed_by: "inc" },
  { id: "kestrel-group", name: "Kestrel Group Holdings plc", country: "GB", owner: "U_DANA", billed_by: "ltd" },
  { id: "kestrel-analytics", name: "Kestrel Analytics Ltd", country: "GB", owner: "U_DANA", parent_id: "kestrel-group", billed_by: "ltd" },
  { id: "castellan", name: "Castellan Biotech AG", country: "CH", owner: "U_SAM", billed_by: "ltd" },
  { id: "lumen", name: "Lumen Retail Group", country: "US", owner: "U_DANA", billed_by: "inc" },
];

export interface Invoice { id: string; party_id: string; issue_date: string; total_cents: number; open_cents: number }

export const INVOICES: Invoice[] = [
  { id: "INV-3101", party_id: "pallister", issue_date: "2026-07-01", total_cents: 850000, open_cents: 850000 },
  { id: "INV-3111", party_id: "tessellate", issue_date: "2026-05-01", total_cents: 500000, open_cents: 500000 },
  { id: "INV-3112", party_id: "tessellate", issue_date: "2026-06-01", total_cents: 250000, open_cents: 250000 },
  { id: "INV-3113", party_id: "tessellate", issue_date: "2026-07-01", total_cents: 125000, open_cents: 125000 },
  { id: "INV-3121", party_id: "ostrander", issue_date: "2026-07-01", total_cents: 730000, open_cents: 730000 },
  { id: "INV-3131", party_id: "ardent", issue_date: "2026-07-01", total_cents: 2500000, open_cents: 2500000 },
  { id: "INV-3141", party_id: "halvorsen", issue_date: "2026-07-01", total_cents: 1200000, open_cents: 1200000 },
  { id: "INV-3151", party_id: "meridian", issue_date: "2026-07-01", total_cents: 1800000, open_cents: 1800000 },
  { id: "INV-3161", party_id: "brightwater", issue_date: "2026-07-01", total_cents: 3300000, open_cents: 3300000 },
  { id: "INV-3171", party_id: "kestrel-analytics", issue_date: "2026-07-01", total_cents: 1500000, open_cents: 1500000 },
  // Castellan: two identical monthly invoices, so no unique subset explains the receipt. Only the remittance says which.
  { id: "INV-3181", party_id: "castellan", issue_date: "2026-04-01", total_cents: 300000, open_cents: 300000 },
  { id: "INV-3182", party_id: "castellan", issue_date: "2026-05-01", total_cents: 300000, open_cents: 300000 },
  { id: "INV-3183", party_id: "castellan", issue_date: "2026-06-01", total_cents: 549498, open_cents: 549498 },
  { id: "INV-3184", party_id: "castellan", issue_date: "2026-07-01", total_cents: 250000, open_cents: 250000 },
  // Lumen's July invoice was paid on the 3rd. The payment on the 21st is a duplicate.
  { id: "INV-3191", party_id: "lumen", issue_date: "2026-07-01", total_cents: 620000, open_cents: 0 },
];

export interface BankLine { id: string; posted_date: string; amount_cents: number; descriptor: string; method: "ach" | "wire"; party_id: string; account: keyof typeof BANK_ACCOUNTS }

export const BANK_LINES: BankLine[] = [
  { id: "BTX-301", posted_date: "2026-07-14", amount_cents: 850000, method: "ach", party_id: "pallister", account: "jpm_operating",
    descriptor: "ORIG CO NAME:PALLISTER MFG INC ORIG ID:9215550143 CO ENTRY DESCR:PAYABLES SEC:CCD TRACE#:021000028841207 IND NAME:NORTHWIND SYSTEMS INC RMR*IV*INV-3101**8500.00" },
  { id: "BTX-302", posted_date: "2026-07-15", amount_cents: 875000, method: "ach", party_id: "tessellate", account: "jpm_lockbox",
    descriptor: "ORIG CO NAME:TESSELLATE SOFTWARE CO ENTRY DESCR:AP BATCH SEC:CTX TRACE#:121000248830117 RMR*IV*INV-3111**5000.00 RMR*IV*INV-3112**2500.00 RMR*IV*INV-3113**1250.00" },
  { id: "BTX-303", posted_date: "2026-07-16", amount_cents: 726200, method: "wire", party_id: "ostrander", account: "hsbc_uk",
    descriptor: "WIRE TYPE:INTL IN TRN:2026071600418832 ORG:OSTRANDER IMPORTS BV ROTTERDAM OBI:INV-3121 JULY PLATFORM FEE CHGS:SHA INTERMEDIARY DED USD 38.00" },
  { id: "BTX-304", posted_date: "2026-07-17", amount_cents: 2494000, method: "wire", party_id: "ardent", account: "hsbc_uk",
    descriptor: "WIRE TYPE:INTL IN TRN:2026071700511207 ORG:ARDENT AEROSPACE GMBH MUENCHEN OBI:INV-3131 CHGS:BEN CORRESPONDENT DED USD 60.00" },
  { id: "BTX-305", posted_date: "2026-07-12", amount_cents: 1080000, method: "ach", party_id: "halvorsen", account: "jpm_operating",
    descriptor: "ORIG CO NAME:HALVORSEN FREIGHT SYS CO ENTRY DESCR:VENDOR PMT SEC:CCD TRACE#:091000019920455 RMR*IV*INV-3141**10800.00" },
  { id: "BTX-306", posted_date: "2026-07-17", amount_cents: 1620000, method: "wire", party_id: "meridian", account: "dbs_sg",
    descriptor: "WIRE TYPE:INTL IN TRN:2026071700660019 ORG:MERIDIAN INFOTECH PVT LTD BENGALURU OBI:INV-3151 NET OF TDS" },
  { id: "BTX-307", posted_date: "2026-07-16", amount_cents: 2970000, method: "ach", party_id: "brightwater", account: "jpm_operating",
    descriptor: "ORIG CO NAME:BRIGHTWATER HEALTH CO ENTRY DESCR:PAYABLES SEC:CCD TRACE#:071000013345512 IND NAME:NORTHWIND SYS" },
  { id: "BTX-308", posted_date: "2026-07-15", amount_cents: 1500000, method: "wire", party_id: "kestrel-group", account: "hsbc_uk",
    descriptor: "WIRE TYPE:INTL IN TRN:2026071500390744 ORG:KESTREL GROUP HOLDINGS PLC LONDON OBI:TREASURY PAYMENT ON BEHALF OF SUBSIDIARY" },
  { id: "BTX-309", posted_date: "2026-07-18", amount_cents: 849498, method: "wire", party_id: "castellan", account: "hsbc_uk",
    descriptor: "WIRE TYPE:INTL IN TRN:2026071800712250 ORG:CASTELLAN BIOTECH AG BASEL OBI:PAYMENT PER REMITTANCE ADVICE" },
  { id: "BTX-310", posted_date: "2026-07-21", amount_cents: 620000, method: "ach", party_id: "lumen", account: "jpm_operating",
    descriptor: "ORIG CO NAME:LUMEN RETAIL GRP CO ENTRY DESCR:PAYABLES SEC:CCD TRACE#:021000021199043 IND NAME:NORTHWIND SYSTEMS INC" },
];

const base = (n: number, party_id: string, line: BankLine, doc_ids: string[], expected: number, extra: Partial<CaseFile> = {}): CaseFile => ({
  intent_id: `int_g${n}`, function: "ar", party_id, entry_date: line.posted_date, bank_txn_id: line.id, doc_ids,
  expected_cents: expected, received_cents: line.amount_cents, shortfall_cents: expected - line.amount_cents, method: line.method,
  trace_ids: [`tr_bank_${line.id}`], ...extra,
});
const line = (id: string): BankLine => BANK_LINES.find((b) => b.id === id)!;

/** The case files the drift monitor would open for these receipts, by its own rules (src/drift/invoiceVsCash.ts). */
export const CASES: CaseFile[] = [
  base(1, "pallister", line("BTX-301"), ["INV-3101"], 850000),
  base(2, "tessellate", line("BTX-302"), ["INV-3111", "INV-3112", "INV-3113"], 875000),
  base(3, "ostrander", line("BTX-303"), ["INV-3121"], 730000),
  base(4, "ardent", line("BTX-304"), ["INV-3131"], 2500000),
  base(5, "halvorsen", line("BTX-305"), ["INV-3141"], 1200000),
  base(6, "meridian", line("BTX-306"), ["INV-3151"], 1800000),
  base(7, "brightwater", line("BTX-307"), ["INV-3161"], 3300000),
  // The payer has nothing open; its subsidiary has one invoice for exactly this amount. The kernel decides if that stands.
  base(8, "kestrel-analytics", line("BTX-308"), ["INV-3171"], 1500000),
  base(9, "castellan", line("BTX-309"), [], 0, { matching_issue: "No unique invoice allocation; obtain the customer's remittance." }),
  base(10, "lumen", line("BTX-310"), [], 0),
];
