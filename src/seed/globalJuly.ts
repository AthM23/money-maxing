import { ACCOUNTS } from "../contract/accounts.js";
import { DOCUMENTS, Q2_WIRE_FEES } from "../demo/scenario/documents.js";
import { BANK_ACCOUNTS, BANK_LINES, CUSTOMERS, ENTITIES, INVOICES } from "../demo/scenario/plants.js";
import { convert } from "../connectors/local.js";
import { World, type AnswerKeyItem, type WorldBankTxn, type WorldContract, type WorldInvoice, type WorldMail, type WorldParty } from "./world.js";

/**
 * The global July as a world file: lane A's ten USD receipts (imported, never retyped: `src/demo/scenario/`) plus the
 * international scene agreed at Gate 1 (`context/GATE1_ANSWERS_A.md`): a German customer billed in euro, whose wire
 * lands short for three reasons, only one of which is judgment. No randomness: every id, date and cent is fixed.
 *
 * What is modelled and what is not. One set of books in USD; entities, bank accounts and countries are labels. The
 * slice is accounts receivable: there are no vendors or bills in this world (the Northwind world has AP). Closed
 * months exist only for the customers whose history the story needs. A foreign-currency invoice is booked at the
 * rate on its date and settled in the same month, so no month-end remeasurement falls between the two; the EUR 2,000
 * still open at 31 July would be remeasured at close, which nothing here automates.
 */
export const GLOBAL_JULY = "global-july";

const EUR_BOOKED_PPM = 1_100_000;
const usd = (cents: number): string => `${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Same limits as lane A's approval matrix and the policy memo it wrote: account owners 5,000, controller 100,000.
const PEOPLE = [
  { id: "U_CEO", name: "Morgan Hale", role: "ceo", email: "morgan.hale@northwind.test" },
  { id: "U_CFO", name: "Alex Moreau", role: "cfo", email: "alex.moreau@northwind.test", limit_cents: 100_000_000 },
  { id: "U_CTRL", name: "Priya Raman", role: "controller", email: "priya.raman@northwind.test", limit_cents: 10_000_000 },
  { id: "U_SAM", name: "Sam Okafor", role: "account_owner", email: "sam.okafor@northwind.test", limit_cents: 500_000 },
  { id: "U_DANA", name: "Dana Reyes", role: "account_owner", email: "dana.reyes@northwind.test", limit_cents: 500_000 },
];

/** How each customer shows on a bank line and in mail. The short name is how people write about them in chat. */
const KNOWN_AS: Record<string, { bank: string; city: string; domain: string; short?: string }> = {
  pallister: { bank: "PALLISTER MFG INC", city: "CLEVELAND", domain: "pallistermfg.test", short: "Pallister" },
  tessellate: { bank: "TESSELLATE SOFTWARE", city: "AUSTIN", domain: "tessellate.test", short: "Tessellate" },
  ostrander: { bank: "OSTRANDER IMPORTS BV", city: "ROTTERDAM", domain: "ostranderimports.test", short: "Ostrander" },
  ardent: { bank: "ARDENT AEROSPACE GMBH", city: "MUENCHEN", domain: "ardentaerospace.test", short: "Ardent" },
  fernhill: { bank: "FERNHILL FOODS LTD", city: "CORK", domain: "fernhillfoods.test", short: "Fernhill" },
  halvorsen: { bank: "HALVORSEN FREIGHT SYS", city: "MINNEAPOLIS", domain: "halvorsenfreight.test", short: "Halvorsen" },
  meridian: { bank: "MERIDIAN INFOTECH PVT LTD", city: "BENGALURU", domain: "meridianinfotech.test", short: "Meridian" },
  brightwater: { bank: "BRIGHTWATER HEALTH", city: "NASHVILLE", domain: "brightwaterhealth.test", short: "Brightwater" },
  "kestrel-group": { bank: "KESTREL GROUP HOLDINGS PLC", city: "LONDON", domain: "kestrelgroup.test" },
  "kestrel-analytics": { bank: "KESTREL ANALYTICS LTD", city: "LONDON", domain: "kestrelanalytics.test" },
  castellan: { bank: "CASTELLAN BIOTECH AG", city: "BASEL", domain: "castellanbiotech.test", short: "Castellan" },
  lumen: { bank: "LUMEN RETAIL GRP", city: "COLUMBUS", domain: "lumenretail.test", short: "Lumen" },
  aldenhoven: { bank: "ALDENHOVEN LOGISTIK GMBH", city: "DUESSELDORF", domain: "aldenhoven-logistik.test", short: "Aldenhoven" },
};

const ALDENHOVEN = { id: "aldenhoven", name: "Aldenhoven Logistik GmbH", country: "DE", owner: "U_SAM", billed_by: "inc" } as const;

/** The euro invoices. USD totals are the euro amounts at the booked rate, to the cent. */
const EUR_INVOICES = [
  { id: "INV-3211", contract_id: "CTR-aldenhoven-2026", eur_cents: 10_000_000, what: "Platform subscription, July 2026" },
  { id: "INV-3212", contract_id: "CTR-aldenhoven-addon-2026", eur_cents: 1_500_000, what: "EU data residency add-on, July 2026" },
] as const;

/** The two euro receipts. Each is the invoice less a 2% service credit the customer took, converted by our bank, less its fee. */
const EUR_RECEIPTS = [
  { id: "BTX-311", invoice: "INV-3211", posted: "2026-07-15", eur_cents: 9_800_000, withheld_eur_cents: 200_000, rate_ppm: 1_080_000, fee_cents: 4_000, trn: "2026071500482913", sap_doc: "1500048117" },
  { id: "BTX-312", invoice: "INV-3212", posted: "2026-07-22", eur_cents: 1_470_000, withheld_eur_cents: 30_000, rate_ppm: 1_085_000, fee_cents: 3_500, trn: "2026072200517740", sap_doc: "1500048562" },
] as const;

/** Closed months, only where the story needs them: the international wire payers whose bank charges the team wrote off. */
const HISTORY: Array<{ party_id: string; monthly_cents: number; account: keyof typeof BANK_ACCOUNTS }> = [
  { party_id: "ostrander", monthly_cents: 730_000, account: "hsbc_uk" },
  { party_id: "ardent", monthly_cents: 2_500_000, account: "hsbc_uk" },
  { party_id: "fernhill", monthly_cents: 2_000_000, account: "hsbc_uk" },
  { party_id: "aldenhoven", monthly_cents: 11_000_000, account: "jpm_operating" }, // billed in USD until the euro amendment of 1 July
];
const ALDENHOVEN_Q2_FEES = [
  { id: "dp_q2_7", party_id: "aldenhoven", cents: 2500, account: ACCOUNTS.bank_charges, day: "2026-04-16" },
  { id: "dp_q2_8", party_id: "aldenhoven", cents: 4000, account: ACCOUNTS.bank_charges, day: "2026-05-18" },
  { id: "dp_q2_9", party_id: "aldenhoven", cents: 3500, account: ACCOUNTS.bank_charges, day: "2026-06-17" },
];

export function generateGlobalJuly(): { world: World; answerKey: AnswerKeyItem[] } {
  const invoices = buildInvoices();
  const txns = buildBank(invoices);
  const contracts = buildContracts(invoices);
  const world = World.parse({
    meta: { seed: 0, company: "Northwind Systems", version: 1, live_period: "2026-07", history_periods: ["2026-04", "2026-05", "2026-06"] },
    periods: [
      { id: "2026-04", status: "locked" }, { id: "2026-05", status: "locked" }, { id: "2026-06", status: "locked" },
      { id: "2026-07", status: "open" }, { id: "2026-08", status: "open" },
    ],
    people: PEOPLE,
    parties: buildParties(),
    contracts,
    invoices,
    bills: [],
    entities: Object.entries(ENTITIES).map(([id, e]) => ({ id, name: e.name, country: e.country })),
    bank: {
      account: "jpm_operating", opening_balance_cents: 0,
      accounts: Object.entries(BANK_ACCOUNTS).map(([id, a]) => ({ id, entity: a.entity, label: a.label, opening_balance_cents: 0 })),
      txns,
    },
    mail: buildMail().sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1)),
    chat: buildChat(),
    crm: buildCrm(contracts),
    files: [policyMemo()],
  });
  return { world, answerKey: answerKey() };
}

function buildParties(): WorldParty[] {
  const customers = [...CUSTOMERS, ALDENHOVEN].map((c): WorldParty => {
    const k = KNOWN_AS[c.id]!;
    return {
      id: c.id, kind: "customer", name: c.name, parent_id: "parent_id" in c ? c.parent_id : undefined, owner: c.owner,
      aliases: [k.bank, c.name, k.domain, ...(k.short ? [k.short] : [])], email_domain: k.domain, country: c.country, billed_by: c.billed_by,
    };
  });
  return [...customers, { id: "unidentified", kind: "other", name: "Unidentified payer", aliases: [] }];
}

function buildInvoices(): WorldInvoice[] {
  const out: WorldInvoice[] = [];
  for (const [mi, month] of ["04", "05", "06"].entries()) {
    for (const [hi, h] of HISTORY.entries()) {
      const issue = `2026-${month}-01`;
      out.push({ id: `INV-2${mi + 4}0${hi + 1}`, party_id: h.party_id, contract_id: h.party_id === "aldenhoven" ? "CTR-aldenhoven-2024" : `CTR-${h.party_id}-2026`, issue_date: issue, due_date: addDays(issue, 30), total_cents: h.monthly_cents });
    }
  }
  for (const i of INVOICES) out.push({ id: i.id, party_id: i.party_id, contract_id: `CTR-${i.party_id}-2026`, issue_date: i.issue_date, due_date: addDays(i.issue_date, 30), total_cents: i.total_cents });
  // Fernhill's July invoice is simply not due yet: an open invoice with no receipt, as most of a real ledger is.
  out.push({ id: "INV-3201", party_id: "fernhill", contract_id: "CTR-fernhill-2026", issue_date: "2026-07-01", due_date: "2026-07-31", total_cents: 2_000_000 });
  for (const e of EUR_INVOICES) {
    out.push({
      id: e.id, party_id: "aldenhoven", contract_id: e.contract_id, issue_date: "2026-07-01", due_date: "2026-07-31", total_cents: convert(e.eur_cents, EUR_BOOKED_PPM),
      fx: { currency: "EUR", foreign_total_cents: e.eur_cents, booked_rate_ppm: EUR_BOOKED_PPM },
    });
  }
  return out;
}

function buildBank(invoices: WorldInvoice[]): WorldBankTxn[] {
  const fees = [...Q2_WIRE_FEES, ...ALDENHOVEN_Q2_FEES];
  const txns: WorldBankTxn[] = [{
    id: "BTX-200", posted_date: "2026-04-01", amount_cents: 500_000_000, descriptor: "BOOK TRANSFER CREDIT B/O NORTHWIND SYSTEMS INC FUNDING", method: "wire",
    recorded_time: "2026-04-01T13:00:00Z", account: "jpm_operating", history: { doc_kind: "equity", applied_cents: 500_000_000 },
  }];
  let n = 201;
  for (const inv of invoices.filter((i) => i.id.startsWith("INV-2"))) {
    const h = HISTORY.find((x) => x.party_id === inv.party_id)!;
    const k = KNOWN_AS[inv.party_id]!;
    const fee = fees.find((f) => f.party_id === inv.party_id && f.day.slice(0, 7) === inv.issue_date.slice(0, 7));
    const posted = fee?.day ?? `${inv.issue_date.slice(0, 8)}17`;
    const received = inv.total_cents - (fee?.cents ?? 0);
    txns.push({
      id: `BTX-${n++}`, posted_date: posted, amount_cents: received, method: "wire", recorded_time: `${posted}T10:00:00Z`, account: h.account,
      descriptor: `WIRE TYPE:INTL IN TRN:${posted.replaceAll("-", "")}00${String(n * 7919).padStart(6, "0").slice(-6)} ORG:${k.bank} ${k.city} OBI:${inv.id} ${fee ? `CHGS:SHA INTERMEDIARY DED USD ${usd(fee.cents)}` : "CHGS:OUR"}`,
      history: { doc_kind: "invoice", doc_id: inv.id, applied_cents: received, ...(fee ? { write_off: { account: fee.account, amount_cents: fee.cents, decided_at: `${fee.day}T15:00:00Z` } } : {}) },
    });
  }
  // Lumen paid its July invoice on the 3rd and the team applied it. The payment on the 21st is therefore a duplicate.
  txns.push({
    id: "BTX-300", posted_date: "2026-07-03", amount_cents: 620_000, method: "ach", recorded_time: "2026-07-03T10:00:00Z", account: "jpm_operating",
    descriptor: "ORIG CO NAME:LUMEN RETAIL GRP CO ENTRY DESCR:PAYABLES SEC:CCD TRACE#:021000021187310 IND NAME:NORTHWIND SYSTEMS INC RMR*IV*INV-3191**6200.00",
    history: { doc_kind: "invoice", doc_id: "INV-3191", applied_cents: 620_000 },
  });
  for (const b of BANK_LINES) txns.push({ id: b.id, posted_date: b.posted_date, amount_cents: b.amount_cents, descriptor: b.descriptor, method: b.method, recorded_time: `${b.posted_date}T10:00:00Z`, account: b.account });
  for (const r of EUR_RECEIPTS) {
    txns.push({
      id: r.id, posted_date: r.posted, amount_cents: convert(r.eur_cents, r.rate_ppm) - r.fee_cents, method: "wire", recorded_time: `${r.posted}T10:00:00Z`, account: "jpm_operating",
      descriptor: `WIRE TYPE:FX IN TRN:${r.trn} ORG:ALDENHOVEN LOGISTIK GMBH DUESSELDORF OGB:COMMERZBANK AG OBI:${r.invoice} ZAHLUNGSAVIS ${r.sap_doc} ORIG AMT EUR ${usd(r.eur_cents)} RATE ${ratePlain(r.rate_ppm)} CHGS USD ${usd(r.fee_cents)}`,
      fx: { currency: "EUR", foreign_amount_cents: r.eur_cents, rate_ppm: r.rate_ppm, fee_cents: r.fee_cents, advice_mail_id: `gj-m-advice-${r.id}` },
    });
  }
  return txns.sort((a, b) => (a.posted_date === b.posted_date ? a.id.localeCompare(b.id) : a.posted_date < b.posted_date ? -1 : 1));
}

const ratePlain = (ppm: number): string => `${Math.floor(ppm / 1_000_000)}.${String(ppm % 1_000_000).padStart(6, "0").slice(0, 4)}`;

function buildContracts(invoices: WorldInvoice[]): WorldContract[] {
  const orderForms = new Map(DOCUMENTS.filter((d) => d.source === "contract").map((d) => [d.party_id!, d]));
  const terms: Record<string, [start: string, end: string]> = { halvorsen: ["2025-07-01", "2027-06-30"], meridian: ["2026-01-01", "2027-12-31"], brightwater: ["2025-01-01", "2026-12-31"] };
  const out: WorldContract[] = [];
  for (const c of CUSTOMERS) {
    const july = invoices.find((i) => i.party_id === c.id && i.issue_date === "2026-07-01");
    if (!july) continue; // the Kestrel parent is a payer, not a customer with a contract
    const [start, end] = terms[c.id] ?? ["2026-01-01", "2026-12-31"];
    const method = BANK_LINES.find((b) => b.party_id === c.id)?.method ?? "wire";
    const form = orderForms.get(c.id);
    out.push({
      id: `CTR-${c.id}-2026`, party_id: c.id, start_date: start, end_date: end, value_cents: july.total_cents * 12,
      terms: { monthly_cents: july.total_cents, billing: "monthly", payment_terms_days: 30, method },
      // lane A's order forms are kept word for word: its stand-ins and tests quote them
      text: form ? `# ${form.payload.title}\n\n${form.payload.text}` : orderForm(c.name, ENTITIES[c.billed_by].name, july.total_cents, method, start, end),
      recorded_time: form?.at ?? `${addDays(start, -16)}T16:00:00Z`,
    });
  }
  out.push(...aldenhovenContracts());
  return out;
}

function orderForm(customer: string, entity: string, monthly: number, method: "ach" | "wire", start: string, end: string): string {
  return [
    `# Order form - ${customer}`,
    `Between ${entity} and ${customer}, under the Northwind Master Subscription Agreement.`,
    `## 1. Fees\nPlatform subscription USD ${usd(monthly)} per month, invoiced monthly in advance on the first day of each month, payable in US dollars.`,
    `## 2. Payment\nNet 30 days from the invoice date by ${method === "wire" ? "wire transfer" : "ACH"} to the account shown on the invoice. Invoices are payable in full without set-off or deduction; bank charges are for the account of the payer.`,
    `## 3. Term\n${start} to ${end}, renewing for successive twelve-month terms unless either party gives sixty days notice.`,
    "## 4. Credits and changes to fees\nNo discount, credit or change to the fees is effective unless agreed in writing by an officer of Northwind.",
  ].join("\n\n");
}

function aldenhovenContracts(): WorldContract[] {
  const master = [
    "# Order form NW-ALD-2024, as amended by Amendment No. 2 - Aldenhoven Logistik GmbH",
    "Between Northwind Systems, Inc. (Delaware) and Aldenhoven Logistik GmbH, Duesseldorf, under the Northwind Master Subscription Agreement.",
    "## 1. Fees\nUntil 30 June 2026: platform subscription USD 110,000.00 per month. Amendment No. 2, effective 1 July 2026, at Customer's request: fees are denominated and invoiced in euro. Platform subscription EUR 100,000.00 per month; EU data residency add-on EUR 15,000.00 per month (order form NW-ALD-2026-DR). Invoiced monthly in advance on the first day of each month.",
    "## 2. Payment\nNet 30 days from the invoice date by wire transfer to the account shown on the invoice. Invoices are payable in full without set-off or deduction. All bank charges and currency conversion costs on the Customer's side are for the Customer's account.",
    "## 3. Taxes\nFees are exclusive of VAT. The services are supplied to a business established in Germany and the reverse charge applies (Article 196 of Directive 2006/112/EC); Customer accounts for VAT. No tax is to be withheld from payments.",
    "## 4. Service levels (Exhibit B)\nMonthly availability commitment: 99.9%. If availability of a service in a calendar month is below 99.9%, Customer may claim a service credit of 2% of that month's fees for the affected service; below 99.0%, 5%. A claim must be made in writing within 30 days after the end of the month. Northwind validates each claim against its own availability records. A service credit is effective only when confirmed in writing by an officer of Northwind and is issued as a credit note against a later invoice. Customer may not deduct a claimed credit from a payment. Service credits are Customer's sole remedy for unavailability.",
    "## 5. Term\n1 January 2024 to 31 December 2026, renewing for successive twelve-month terms unless either party gives ninety days notice.",
  ].join("\n\n");
  const addon = [
    "# Order form NW-ALD-2026-DR - EU data residency add-on - Aldenhoven Logistik GmbH",
    "An additional order form under order form NW-ALD-2024 as amended. All of its terms apply, including section 2 (payment without deduction) and section 4 (service levels, Exhibit B).",
    "## 1. Fees\nEU data residency add-on EUR 15,000.00 per month, invoiced monthly in advance in euro, from 1 July 2026.",
    "## 2. Term\n1 July 2026 to 31 December 2026, co-terminous with order form NW-ALD-2024.",
  ].join("\n\n");
  return [
    { id: "CTR-aldenhoven-2024", party_id: "aldenhoven", start_date: "2024-01-01", end_date: "2026-06-30", value_cents: 11_000_000 * 30, terms: { monthly_cents: 11_000_000, billing: "monthly", payment_terms_days: 30, method: "wire" }, text: master, recorded_time: "2023-12-12T16:00:00Z" },
    { id: "CTR-aldenhoven-2026", party_id: "aldenhoven", start_date: "2026-07-01", end_date: "2026-12-31", value_cents: convert(10_000_000, EUR_BOOKED_PPM) * 6, terms: { monthly_cents: convert(10_000_000, EUR_BOOKED_PPM), billing: "monthly", payment_terms_days: 30, method: "wire", currency: "EUR", foreign_monthly_cents: 10_000_000 }, text: master, recorded_time: "2026-06-12T16:00:00Z" },
    { id: "CTR-aldenhoven-addon-2026", party_id: "aldenhoven", start_date: "2026-07-01", end_date: "2026-12-31", value_cents: convert(1_500_000, EUR_BOOKED_PPM) * 6, terms: { monthly_cents: convert(1_500_000, EUR_BOOKED_PPM), billing: "monthly", payment_terms_days: 30, method: "wire", currency: "EUR", foreign_monthly_cents: 1_500_000 }, text: addon, recorded_time: "2026-06-12T16:05:00Z" },
  ];
}

function buildMail(): WorldMail[] {
  const threads: Record<string, string> = { tr_mail_halvorsen_1: "gj-t-halvorsen-pricing", tr_mail_halvorsen_2: "gj-t-halvorsen-pricing" };
  // The demo mailbox also holds the Northwind world, whose CEO wrote to Initech in the same second under the same
  // subject. The Gmail seeder recognises a copy by sender, second and subject, so this one moves four minutes.
  const sentAt: Record<string, string> = { tr_mail_halvorsen_2: "2026-06-28T15:04:00Z" };
  const fromLaneA = DOCUMENTS.filter((d) => d.source === "gmail").map((d): WorldMail => {
    const id = `gj-m-${d.id.replace(/^tr_mail_/, "").replaceAll("_", "-")}`;
    return { id, thread_id: threads[d.id] ?? id.replace("gj-m-", "gj-t-"), date: sentAt[d.id] ?? d.at, from: d.payload.from!, to: [d.payload.to!], cc: [], subject: d.payload.subject!, body: d.payload.body!, ...(d.party_id ? { party_id: d.party_id } : {}) };
  });
  return [...fromLaneA, ...EUR_RECEIPTS.flatMap((r) => [bankAdvice(r), zahlungsavis(r)]), ...aldenhovenThread(), ...noise()];
}

type EurReceipt = (typeof EUR_RECEIPTS)[number];

/** The bank's incoming-wire credit advice, laid out as the SWIFT fields a cash team reads: 32A, 33B, 36, 71. */
function bankAdvice(r: EurReceipt): WorldMail {
  const gross = convert(r.eur_cents, r.rate_ppm);
  return {
    id: `gj-m-advice-${r.id}`, thread_id: `gj-t-advice-${r.id}`, date: `${r.posted}T09:05:00Z`, from: "wire.advices@jpmorgan-access.test", to: ["treasury@northwind.test"], cc: ["ar@northwind.test"],
    subject: `Incoming wire credit advice - TRN ${r.trn} - USD ${usd(gross - r.fee_cents)}`, party_id: "aldenhoven",
    body: [
      "INCOMING FUNDS TRANSFER - CREDIT ADVICE", "",
      "Beneficiary: NORTHWIND SYSTEMS INC", "Account credited: USD operating account ending 4417", `Value date: ${r.posted}`, `Transaction reference (TRN): ${r.trn}`, "",
      "Ordering customer: ALDENHOVEN LOGISTIK GMBH, DUESSELDORF, DE", "Ordering institution: COMMERZBANK AG, DUESSELDORF (COBADEFFXXX)",
      `Remittance information: ${r.invoice} ZAHLUNGSAVIS ${r.sap_doc}`, "Details of charges: SHA", "",
      `Instructed amount: EUR ${usd(r.eur_cents)}`, `Exchange rate applied: ${ratePlain(r.rate_ppm)} USD per EUR`, `USD equivalent: USD ${usd(gross)}`,
      `Charges deducted (incoming international wire and currency conversion): USD ${usd(r.fee_cents)}`, `Net amount credited: USD ${usd(gross - r.fee_cents)}`, "",
      "The payment was received in a currency other than that of the beneficiary account and was converted at the bank's rate on the value date.",
      "This advice is for information. It is not a statement of account.",
    ].join("\n"),
  };
}

/** A payment advice as a German customer's SAP payment run sends it: one line per invoice, gross, deduction, net. */
function zahlungsavis(r: EurReceipt): WorldMail {
  const inv = EUR_INVOICES.find((e) => e.id === r.invoice)!;
  return {
    id: `gj-m-avis-${r.id}`, thread_id: `gj-t-avis-${r.id}`, date: `${addDays(r.posted, -1)}T14:40:00Z`, from: "kreditoren@aldenhoven-logistik.test", to: ["ar@northwind.test"], cc: [],
    subject: `Zahlungsavis / Payment advice ${r.sap_doc} - Aldenhoven Logistik GmbH`, party_id: "aldenhoven",
    body: [
      "Aldenhoven Logistik GmbH - Kreditorenbuchhaltung / Accounts Payable", `Zahlungsavis / Payment advice no. ${r.sap_doc}`, `Payment date: ${addDays(r.posted, -1)}   Value date: ${r.posted}   Payment method: SEPA/foreign wire, EUR   Our vendor no.: 300417`, "",
      "Invoice      Invoice date   Gross EUR      Deduction EUR   Net EUR",
      `${inv.id}     2026-07-01     ${usd(inv.eur_cents).padStart(10)}     ${usd(r.withheld_eur_cents).padStart(9)}       ${usd(r.eur_cents).padStart(10)}`, "",
      `Deduction: EUR ${usd(r.withheld_eur_cents)}, reason: service credit 2% under Exhibit B (SLA), platform outage 8 July 2026, our claim of 9 July 2026.`,
      `Total paid: EUR ${usd(r.eur_cents)}`, "", "Queries: kreditoren@aldenhoven-logistik.test. This advice was generated automatically.",
    ].join("\n"),
  };
}

/** The claim and the honest reply. Together they prove what the customer wants and that nobody has agreed to it. */
function aldenhovenThread(): WorldMail[] {
  const t = "gj-t-aldenhoven-sla";
  return [
    { id: "gj-m-aldenhoven-1", thread_id: t, date: "2026-07-09T08:20:00Z", from: "j.brandt@aldenhoven-logistik.test", to: ["sam.okafor@northwind.test"], cc: ["kreditoren@aldenhoven-logistik.test"], subject: "SLA claim - outage 8 July", party_id: "aldenhoven",
      body: "Hello Sam,\n\nYesterday's outage took our dispatch boards down for the whole early shift in Duisburg and Venlo, 06:12 to 12:52 UTC by your own status page. That is 6 hours 40 minutes, which puts July below 99.9% whatever happens for the rest of the month.\n\nPlease treat this email as our written claim under Exhibit B for the 2% service credit on the July fees. Our accounts payable team will take the 2% off the July invoices when they pay them.\n\nRegards,\nJonas Brandt\nHead of IT Operations, Aldenhoven Logistik GmbH" },
    { id: "gj-m-aldenhoven-2", thread_id: t, date: "2026-07-09T15:45:00Z", from: "sam.okafor@northwind.test", to: ["j.brandt@aldenhoven-logistik.test"], cc: [], subject: "Re: SLA claim - outage 8 July", party_id: "aldenhoven",
      body: "Hi Jonas,\n\nUnderstood, and sorry again for yesterday. I have logged your claim and passed it to our finance team. I cannot confirm a credit myself: under Exhibit B a credit has to be validated against the month's availability and confirmed by one of our officers, and it is then issued as a credit note rather than deducted from a payment. I will come back to you as soon as I have an answer.\n\nSam Okafor\nNorthwind Systems" },
  ];
}

function noise(): WorldMail[] {
  const rows: Array<[id: string, date: string, from: string, subject: string, body: string, party?: string]> = [
    ["gj-m-noise-3", "2026-07-01T07:30:00Z", "statements@jpmorgan-access.test", "Your June statements are available", "Statements for your accounts ending 4417 and 4425 for the period ending 30 June 2026 are available in online banking."],
    ["gj-m-noise-4", "2026-07-02T13:00:00Z", "priya.raman@northwind.test", "July close calendar", "Cash and AR by working day 3, accruals by working day 4, flux review on working day 5. Open reconciling items to me by end of day 2."],
    ["gj-m-noise-5", "2026-07-10T09:15:00Z", "ap@pallistermfg.test", "Updated remit-to confirmation", "We have your remit-to details on file for JPMorgan Chase, account ending 4417. No change requested. Pallister Manufacturing AP", "pallister"],
    ["gj-m-noise-6", "2026-07-13T11:10:00Z", "kreditoren@aldenhoven-logistik.test", "Invoice INV-3211 and INV-3212 received", "We confirm receipt of invoices INV-3211 and INV-3212 dated 1 July 2026. Both are scheduled in our payment runs of 14 and 21 July.", "aldenhoven"],
    ["gj-m-noise-7", "2026-07-20T16:05:00Z", "ap@fernhillfoods.test", "July invoice INV-3201", "INV-3201 is approved and will be paid in our month-end run on 31 July. Fernhill Foods Accounts Payable", "fernhill"],
  ];
  return rows.map(([id, date, from, subject, body, party]) => ({ id, thread_id: id.replace("gj-m-", "gj-t-"), date, from, to: ["ar@northwind.test"], cc: [], subject, body, ...(party ? { party_id: party } : {}) }));
}

/** The incident as the company talked about it. It proves the outage and its length. It authorises nothing. */
function buildChat(): World["chat"] {
  const fromLaneA = DOCUMENTS.filter((d) => d.source === "slack").map((d, i) => ({
    id: `gj-c-a${i + 1}`, channel: d.payload.channel!.replace(/^#/, ""), user: "U_SAM", ts: d.at, text: d.payload.text!, ...(d.party_id ? { party_id: d.party_id } : {}),
  }));
  return [
    ...fromLaneA,
    { id: "gj-c-1", channel: "cs-escalations", user: "U_SAM", ts: "2026-07-08T06:31:00Z", text: "INC-2291: EU-central ingestion is down since 06:12 UTC. Aldenhoven's dispatch boards are blank and their early shift is on paper. Engineering is on it.", party_id: "aldenhoven" },
    { id: "gj-c-2", channel: "cs-escalations", user: "U_SAM", ts: "2026-07-08T13:05:00Z", text: "INC-2291 resolved at 12:52 UTC. 6 hours 40 minutes in total for EU-central. Status page updated, postmortem by Friday.", party_id: "aldenhoven" },
    { id: "gj-c-3", channel: "cs-escalations", user: "U_SAM", ts: "2026-07-09T15:50:00Z", text: "Aldenhoven have filed an SLA claim for the 2% and say their AP will just deduct it from the July invoices. I told Jonas I cannot confirm a credit. Who signs these off?", party_id: "aldenhoven" },
    { id: "gj-c-4", channel: "cs-escalations", user: "U_CTRL", ts: "2026-07-09T16:20:00Z", text: "Exhibit B credits need an officer, so Alex. Nothing is approved for Aldenhoven yet. If they short-pay before it is, AR holds the difference as disputed and we do not write it off.", party_id: "aldenhoven" },
    { id: "gj-c-5", channel: "finance", user: "U_CTRL", ts: "2026-07-01T14:00:00Z", text: "July invoices are out, including the first two in euro for Aldenhoven, booked at 1.1000. We still have no EUR account, so their wires will be converted by JPMorgan on the way in." },
  ];
}

function buildCrm(contracts: WorldContract[]): World["crm"] {
  const names = new Map([...CUSTOMERS, ALDENHOVEN].map((c) => [c.id, c] as const));
  const deals = contracts.map((c) => ({
    id: `DEAL-${c.id}`, party_id: c.party_id, name: `${names.get(c.party_id)!.name} ${c.start_date.slice(0, 4)} subscription`, amount_cents: c.value_cents,
    close_date: c.recorded_time.slice(0, 10), owner: names.get(c.party_id)!.owner, stage: "closedwon", recorded_time: c.recorded_time,
  }));
  const notes = [
    { id: "GJ-N-1", party_id: "aldenhoven", ts: "2026-06-12T16:30:00Z", author: "U_SAM", text: "Amendment No. 2 signed. Aldenhoven moves to euro pricing from 1 July: EUR 100,000 platform (was USD 110,000) plus the EUR 15,000 data residency add-on. Their treasury will pay by euro wire." },
    { id: "GJ-N-2", party_id: "aldenhoven", ts: "2026-07-09T16:00:00Z", author: "U_SAM", text: "Jonas Brandt filed an Exhibit B claim for the 8 July outage (INC-2291). Not confirmed by us. Passed to finance." },
    { id: "GJ-N-3", party_id: "kestrel-analytics", ts: "2026-06-30T10:00:00Z", author: "U_DANA", text: "Kestrel is centralising treasury under Kestrel Group Holdings. The contracting entity stays Kestrel Analytics Ltd." },
  ];
  return { deals, notes };
}

/** Lane A's policy memo, sentence for sentence (its tests quote it), set out as sections, plus the two the euro scene needs. */
function policyMemo(): World["files"][number] {
  const memo = DOCUMENTS.find((d) => d.kind === "policy_memo")!.payload.text!;
  const sentence = (start: string): string => {
    const from = memo.indexOf(start);
    if (from < 0) throw new Error(`lane A's policy memo no longer contains "${start}"`);
    const next = memo.indexOf(". ", from);
    return memo.slice(from, next < 0 ? undefined : next + 1);
  };
  return {
    id: "policy-memo", kind: "policy_memo", title: "Northwind accounting policy memo FY2026", recorded_time: "2026-01-02T00:00:00Z",
    sections: [
      { slug: "approval", heading: "1. Approval", text: `${sentence("Adjustments of USD 500")} ${sentence("Account owners may approve")}` },
      { slug: "concessions", heading: "2. Price concessions", text: sentence("Price concessions on subscriptions") },
      { slug: "bank-charges", heading: "3. Bank charges on international wires", text: sentence("Charges deducted by intermediary banks") },
      { slug: "withholding-tax", heading: "4. Tax withheld at source", text: sentence("Tax deducted at source") },
      { slug: "paying-entity", heading: "5. Payments from another legal entity", text: sentence("A customer may pay from another legal entity") },
      { slug: "foreign-currency", heading: "6. Foreign-currency receivables", text: "An invoice in a foreign currency is recorded in US dollars at the exchange rate on the invoice date. When it is paid, the difference between that rate and the rate the bank applied to the receipt is a realised exchange gain or loss (7100). It is arithmetic on the bank's own advice, not a concession, and it is never netted against a customer's deduction. Foreign-currency receivables still open at month end are remeasured at the closing rate." },
      { slug: "customer-deductions", heading: "7. Customer deductions and service credits", text: "A deduction is not accepted because a customer took it. A service credit is due only under the customer's service level exhibit: claimed in writing, validated against our availability records, confirmed in writing by an officer, and issued as a credit note. Until then the unpaid amount stays open on the invoice as disputed. It is not written off and it is not booked as a discount." },
    ],
  };
}

function answerKey(): AnswerKeyItem[] {
  const eur = EUR_RECEIPTS.map((r): AnswerKeyItem => {
    const inv = EUR_INVOICES.find((e) => e.id === r.invoice)!;
    const booked = convert(inv.eur_cents, EUR_BOOKED_PPM);
    const received = convert(r.eur_cents, r.rate_ppm) - r.fee_cents;
    const causes = { fx_loss_cents: convert(r.eur_cents, EUR_BOOKED_PPM) - convert(r.eur_cents, r.rate_ppm), bank_fee_cents: r.fee_cents, withheld_cents: convert(r.withheld_eur_cents, EUR_BOOKED_PPM) };
    return {
      plant: r.id === "BTX-311" ? "eur_wire_three_causes" : "eur_wire_in_scope_reuse", party_id: "aldenhoven", bank_txn_id: r.id, doc_ids: [r.invoice], shortfall_cents: booked - received, causes,
      explained_by: `mail:gj-m-advice-${r.id}, mail:gj-m-avis-${r.id}, contract Exhibit B; no officer has confirmed the credit`,
      expected: r.id === "BTX-311"
        ? "apply_payment AUTO; write_off of the fee to 6150 under the wire-fee rule; fx_realized to 7100 re-performed from the advice; the withheld EUR 2,000 (USD 2,200.00) ESCALATE once, then credit_memo Dr 2400 with a person's approval, remembered as a standing 2% for this customer"
        : "same first three entries from code; the withheld EUR 300 (USD 330.00) booked from the standing answer with nobody asked. Only if that answer was standing: a one-time answer must ask again",
    };
  });
  return [
    ...eur,
    { plant: "wire_fee_under_rule", party_id: "ostrander", bank_txn_id: "BTX-303", doc_ids: ["INV-3121"], shortfall_cents: 3800, expected: "write_off to 6150 under SHORT-PAY-01 once compiled from Q2 and approved" },
    { plant: "wire_fee_over_rule", party_id: "ardent", bank_txn_id: "BTX-304", doc_ids: ["INV-3131"], shortfall_cents: 6000, expected: "over the rule's ceiling: PROPOSE, a person approves, rule v2" },
    { plant: "ceo_concession_in_inbox", party_id: "halvorsen", bank_txn_id: "BTX-305", doc_ids: ["INV-3141"], shortfall_cents: 120_000, explained_by: "mail:gj-m-halvorsen-2", expected: "credit_memo Dr 2400 PROPOSE quoting the CEO; standing 10% to 2027-06-30" },
    { plant: "tax_withheld_at_source", party_id: "meridian", bank_txn_id: "BTX-306", doc_ids: ["INV-3151"], shortfall_cents: 180_000, explained_by: "mail:gj-m-meridian-1", expected: "tax_withholding to 1350, never a discount" },
    { plant: "deduction_nobody_agreed", party_id: "brightwater", bank_txn_id: "BTX-307", doc_ids: ["INV-3161"], shortfall_cents: 330_000, expected: "ESCALATE to the account owner once; nothing written off" },
    { plant: "parent_pays_for_subsidiary", party_id: "kestrel-analytics", bank_txn_id: "BTX-308", doc_ids: ["INV-3171"], shortfall_cents: 0, explained_by: "mail:gj-m-kestrel-1", expected: "kernel refuses the party tie until the payer is confirmed and recorded" },
    { plant: "remittance_only_the_reader_can_parse", party_id: "castellan", bank_txn_id: "BTX-309", doc_ids: ["INV-3182", "INV-3183"], shortfall_cents: 0, explained_by: "mail:gj-m-castellan-1", expected: "the monitor must stay undecided (two identical open invoices); the reader names the two" },
    { plant: "duplicate_payment", party_id: "lumen", bank_txn_id: "BTX-310", doc_ids: [], shortfall_cents: 0, expected: "held as unapplied cash in 2100, parked for a person" },
  ];
}
