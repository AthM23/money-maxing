import { ACCOUNTS } from "../contract/accounts.js";
import { convert } from "../connectors/local.js";
import { DOCUMENTS, Q2_WIRE_FEES } from "../demo/scenario/documents.js";
import { BANK_ACCOUNTS, BANK_LINES, CUSTOMERS, ENTITIES, INVOICES } from "../demo/scenario/plants.js";
import { SEED_ACCOUNTS } from "../ledger/accounts.js";
import { World, type AnswerKeyItem, type WorldBankTxn, type WorldContract, type WorldInvoice, type WorldMail, type WorldParty } from "./world.js";

/**
 * The global July as a world file: lane A's ten USD receipts (imported, never retyped: `src/demo/scenario/`) and its
 * main scene, seeded the way a finance team would find them. The main scene is the one agreed at Gate 1
 * (`context/GATE1_ANSWERS_A.md`, `SCENARIO.md`, `src/demo/scenario/mainScene.ts`): Vossberg Logistik GmbH is billed in
 * euro, and its wire lands short for three reasons, only one of which is judgment. No randomness: every id, date and
 * cent is fixed.
 *
 * What is modelled and what is not. One set of books in USD; entities, bank accounts and countries are labels. The
 * slice is accounts receivable: there are no vendors or bills in this world (the Northwind world has AP). Closed
 * months exist only for the customers whose history the story needs. A foreign-currency invoice is booked at the
 * rate on its date. INV-3201 is issued on 15 June and paid on 15 July, so the seeded history remeasures it at the
 * 30 June closing rate and reverses that on 1 July, as an ERP's month-end revaluation does; realised FX therefore
 * still runs from the booked rate. Remeasuring what stays open at 31 July is close work nothing here automates.
 */
export const GLOBAL_JULY = "global-july";

const EUR_BOOKED_PPM = 1_100_000;
/** The closing rate the team remeasured open euro receivables at on 30 June. */
const JUNE_CLOSING_PPM = 1_090_000;
const usd = (cents: number): string => `${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
const ratePlain = (ppm: number): string => `${Math.floor(ppm / 1_000_000)}.${String(ppm % 1_000_000).padStart(6, "0").slice(0, 4)}`;
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
  vossberg: { bank: "VOSSBERG LOGISTIK GMBH", city: "HAMBURG", domain: "vossberg-logistik.test", short: "Vossberg" },
};

const VOSSBERG = { id: "vossberg", name: "Vossberg Logistik GmbH", country: "DE", owner: "U_SAM", billed_by: "inc" } as const;

/** The euro invoices of the main scene, with lane A's ids and amounts. USD totals are the euro amounts at the booked rate. */
const EUR_INVOICES = [
  { id: "INV-3201", contract_id: "CTR-vossberg-2025", eur_cents: 10_000_000, issue: "2026-06-15", due: "2026-07-15", service_from: "2026-07" },
  { id: "INV-3202", contract_id: "CTR-vossberg-addon-2026", eur_cents: 2_500_000, issue: "2026-07-01", due: "2026-07-31", service_from: undefined },
] as const;

/** The two euro receipts. Each is the invoice less the 2% the customer held back, converted by our bank, less its fee. */
const EUR_RECEIPTS = [
  { id: "BTX-320", invoice: "INV-3201", posted: "2026-07-15", eur_cents: 9_800_000, withheld_eur_cents: 200_000, rate_ppm: 1_080_000, fee_cents: 4_000, trn: "2026071500881203", sap_doc: "1500048117" },
  { id: "BTX-321", invoice: "INV-3202", posted: "2026-07-22", eur_cents: 2_450_000, withheld_eur_cents: 50_000, rate_ppm: 1_090_000, fee_cents: 2_500, trn: "2026072200413377", sap_doc: "1500048562" },
] as const;

/** Closed months, only where the story needs them: the international wire payers whose bank charges the team wrote off. */
const HISTORY: Array<{ party_id: string; monthly_cents: number; account: keyof typeof BANK_ACCOUNTS }> = [
  { party_id: "ostrander", monthly_cents: 730_000, account: "hsbc_uk" },
  { party_id: "ardent", monthly_cents: 2_500_000, account: "hsbc_uk" },
  { party_id: "fernhill", monthly_cents: 2_000_000, account: "hsbc_uk" },
];

/**
 * Vossberg's second quarter: the monthly add-on, EUR 25,000.00, each booked at that month's rate and paid by euro wire.
 * The team wrote off the bank's incoming-wire fee each time (lane A's amounts and days), and the rate went both ways.
 */
const ADDON_EUR_CENTS = 2_500_000;
const VOSSBERG_Q2 = [
  { invoice: "INV-2404", month: "04", booked_ppm: 1_080_000, paid: "2026-04-16", rate_ppm: 1_084_000, fee_cents: 4_000 },
  { invoice: "INV-2504", month: "05", booked_ppm: 1_090_000, paid: "2026-05-18", rate_ppm: 1_086_000, fee_cents: 4_000 },
  { invoice: "INV-2604", month: "06", booked_ppm: 1_095_000, paid: "2026-06-17", rate_ppm: 1_095_000, fee_cents: 3_500 },
] as const;

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
    journals: remeasurement(),
  });
  return { world, answerKey: answerKey() };
}

function buildParties(): WorldParty[] {
  const customers = [...CUSTOMERS, VOSSBERG].map((c): WorldParty => {
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
      out.push({ id: `INV-2${mi + 4}0${hi + 1}`, party_id: h.party_id, contract_id: `CTR-${h.party_id}-2026`, issue_date: issue, due_date: addDays(issue, 30), total_cents: h.monthly_cents });
    }
  }
  for (const q of VOSSBERG_Q2) {
    const issue = `2026-${q.month}-01`;
    out.push({
      id: q.invoice, party_id: "vossberg", contract_id: "CTR-vossberg-addon-2026", issue_date: issue, due_date: addDays(issue, 30), total_cents: convert(ADDON_EUR_CENTS, q.booked_ppm),
      fx: { currency: "EUR", foreign_total_cents: ADDON_EUR_CENTS, booked_rate_ppm: q.booked_ppm },
    });
  }
  for (const i of INVOICES) out.push({ id: i.id, party_id: i.party_id, contract_id: `CTR-${i.party_id}-2026`, issue_date: i.issue_date, due_date: addDays(i.issue_date, 30), total_cents: i.total_cents });
  // Fernhill's July invoice is simply not due yet: an open invoice with no receipt, as most of a real ledger is.
  out.push({ id: "INV-3221", party_id: "fernhill", contract_id: "CTR-fernhill-2026", issue_date: "2026-07-01", due_date: "2026-07-31", total_cents: 2_000_000 });
  for (const e of EUR_INVOICES) {
    out.push({
      id: e.id, party_id: "vossberg", contract_id: e.contract_id, issue_date: e.issue, due_date: e.due, total_cents: convert(e.eur_cents, EUR_BOOKED_PPM),
      fx: { currency: "EUR", foreign_total_cents: e.eur_cents, booked_rate_ppm: EUR_BOOKED_PPM }, ...(e.service_from ? { service_from: e.service_from } : {}),
    });
  }
  return out;
}

/** 30 June: INV-3201 is open, so it is remeasured at the closing rate. 1 July: the revaluation reverses itself. */
function remeasurement(): NonNullable<World["journals"]> {
  const eur = EUR_INVOICES[0].eur_cents;
  const cents = convert(eur, EUR_BOOKED_PPM) - convert(eur, JUNE_CLOSING_PPM);
  const what = `INV-3201 EUR ${usd(eur)} remeasured from ${ratePlain(EUR_BOOKED_PPM)} to the 30 June closing rate ${ratePlain(JUNE_CLOSING_PPM)}`;
  return [
    { id: "reval-2026-06", date: "2026-06-30", memo: `Month-end revaluation: ${what}`, party_id: "vossberg", lines: [{ account: SEED_ACCOUNTS.unrealized_fx, debit_cents: cents, credit_cents: 0 }, { account: ACCOUNTS.ar, debit_cents: 0, credit_cents: cents }] },
    { id: "reval-2026-06-rev", date: "2026-07-01", memo: `Reversal of month-end revaluation: ${what}`, party_id: "vossberg", lines: [{ account: ACCOUNTS.ar, debit_cents: cents, credit_cents: 0 }, { account: SEED_ACCOUNTS.unrealized_fx, debit_cents: 0, credit_cents: cents }] },
  ];
}

function buildBank(invoices: WorldInvoice[]): WorldBankTxn[] {
  const txns: WorldBankTxn[] = [{
    id: "BTX-200", posted_date: "2026-04-01", amount_cents: 500_000_000, descriptor: "BOOK TRANSFER CREDIT B/O NORTHWIND SYSTEMS INC FUNDING", method: "wire",
    recorded_time: "2026-04-01T13:00:00Z", account: "jpm_operating", history: { doc_kind: "equity", applied_cents: 500_000_000 },
  }];
  let n = 201;
  const trn = (day: string): string => `${day.replaceAll("-", "")}00${String(n * 7919).padStart(6, "0").slice(-6)}`;
  for (const inv of invoices.filter((i) => i.id.startsWith("INV-2") && !i.fx)) {
    const h = HISTORY.find((x) => x.party_id === inv.party_id)!;
    const k = KNOWN_AS[inv.party_id]!;
    const fee = Q2_WIRE_FEES.find((f) => f.party_id === inv.party_id && f.day.slice(0, 7) === inv.issue_date.slice(0, 7));
    const posted = fee?.day ?? `${inv.issue_date.slice(0, 8)}17`;
    const received = inv.total_cents - (fee?.cents ?? 0);
    txns.push({
      id: `BTX-${n++}`, posted_date: posted, amount_cents: received, method: "wire", recorded_time: `${posted}T10:00:00Z`, account: h.account,
      descriptor: `WIRE TYPE:INTL IN TRN:${trn(posted)} ORG:${k.bank} ${k.city} OBI:${inv.id} ${fee ? `CHGS:SHA INTERMEDIARY DED USD ${usd(fee.cents)}` : "CHGS:OUR"}`,
      history: { doc_kind: "invoice", doc_id: inv.id, applied_cents: received, ...(fee ? { write_off: { account: fee.account, amount_cents: fee.cents, decided_at: `${fee.day}T15:00:00Z` } } : {}) },
    });
  }
  for (const q of VOSSBERG_Q2) {
    const converted = convert(ADDON_EUR_CENTS, q.rate_ppm);
    txns.push({
      id: `BTX-${n++}`, posted_date: q.paid, amount_cents: converted - q.fee_cents, method: "wire", recorded_time: `${q.paid}T10:00:00Z`, account: "jpm_operating",
      descriptor: `WIRE TYPE:INTL IN TRN:${trn(q.paid)} ORG:VOSSBERG LOGISTIK GMBH HAMBURG OBI:${q.invoice}`,
      fx: { currency: "EUR", foreign_amount_cents: ADDON_EUR_CENTS, rate_ppm: q.rate_ppm, fee_cents: q.fee_cents },
      history: {
        doc_kind: "invoice", doc_id: q.invoice, applied_cents: converted - q.fee_cents, fx_loss_cents: convert(ADDON_EUR_CENTS, q.booked_ppm) - converted,
        write_off: { account: ACCOUNTS.bank_charges, amount_cents: q.fee_cents, decided_at: `${q.paid}T15:00:00Z` },
      },
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
      descriptor: `WIRE TYPE:INTL IN TRN:${r.trn} ORG:VOSSBERG LOGISTIK GMBH HAMBURG OBI:${r.invoice}`, // lane A's descriptor, to the letter
      fx: { currency: "EUR", foreign_amount_cents: r.eur_cents, rate_ppm: r.rate_ppm, fee_cents: r.fee_cents, advice_mail_id: `gj-m-advice-${r.id}` },
    });
  }
  return txns.sort((a, b) => (a.posted_date === b.posted_date ? a.id.localeCompare(b.id) : a.posted_date < b.posted_date ? -1 : 1));
}

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
  out.push(...vossbergContracts());
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

/** Lane A's order form wording for fees and section 7, word for word, inside the clauses such a contract also carries. */
export const VOSSBERG_FEES = "Fees EUR 100,000 per quarter for the platform, invoiced quarterly in advance, payable in euro, net 30. Add-on modules invoiced separately.";
export const VOSSBERG_SECTION_7 = "Section 7: service credits of up to 2% of the fees for the affected period may be granted at Northwind's discretion and are effective only when confirmed in writing by an officer of Northwind.";

function vossbergContracts(): WorldContract[] {
  const master = [
    "# Order form NW-VOS-2025 - Vossberg Logistik GmbH",
    "Between Northwind Systems, Inc. (Delaware) and Vossberg Logistik GmbH, Hamburg, under the Northwind Master Subscription Agreement.",
    `## Fees\n${VOSSBERG_FEES}`,
    "## Payment\nBy wire transfer to the account shown on the invoice. Invoices are payable in full without set-off or deduction. Bank charges and currency conversion costs on the Customer's side are for the Customer's account.",
    "## Taxes\nFees are exclusive of VAT. The services are supplied to a business established in Germany and the reverse charge applies (Article 196 of Directive 2006/112/EC); Customer accounts for VAT. No tax is to be withheld from payments.",
    `## Service credits\n${VOSSBERG_SECTION_7} A credit so confirmed is issued as a credit note against a later invoice.`,
    "## Term\n1 October 2025 to 30 September 2027, renewing for successive twelve-month terms unless either party gives ninety days notice.",
  ].join("\n\n");
  const addon = [
    "# Order form NW-VOS-2026-DR - EU data residency add-on - Vossberg Logistik GmbH",
    "An add-on module under order form NW-VOS-2025. All of its terms apply, including payment without deduction and section 7 (service credits).",
    "## Fees\nEU data residency add-on EUR 25,000 per month, invoiced monthly in advance on the first day of each month, payable in euro, net 30, from 1 April 2026.",
    "## Term\n1 April 2026 to 30 September 2027, co-terminous with order form NW-VOS-2025.",
  ].join("\n\n");
  const quarter = convert(10_000_000, EUR_BOOKED_PPM);
  const month = convert(ADDON_EUR_CENTS, EUR_BOOKED_PPM);
  return [
    // values are nominal USD at the July booked rate; each invoice is booked at the rate on its own date
    { id: "CTR-vossberg-2025", party_id: "vossberg", start_date: "2025-10-01", end_date: "2027-09-30", value_cents: quarter * 8, terms: { monthly_cents: Math.round(quarter / 3), billing: "quarterly", payment_terms_days: 30, method: "wire", currency: "EUR" }, text: master, recorded_time: "2025-10-01T00:00:00Z" },
    { id: "CTR-vossberg-addon-2026", party_id: "vossberg", start_date: "2026-04-01", end_date: "2027-09-30", value_cents: month * 18, terms: { monthly_cents: month, billing: "monthly", payment_terms_days: 30, method: "wire", currency: "EUR", foreign_monthly_cents: ADDON_EUR_CENTS }, text: addon, recorded_time: "2026-03-20T16:00:00Z" },
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
  return [...fromLaneA, ...EUR_RECEIPTS.flatMap((r) => [bankAdvice(r), zahlungsavis(r)]), ...vossbergThread(), ...noise()];
}

type EurReceipt = (typeof EUR_RECEIPTS)[number];

/** The bank's incoming-wire credit advice, laid out as the fields a cash team reads off it. Lane A's facts and sender. */
function bankAdvice(r: EurReceipt): WorldMail {
  const gross = convert(r.eur_cents, r.rate_ppm);
  return {
    id: `gj-m-advice-${r.id}`, thread_id: `gj-t-advice-${r.id}`, date: `${r.posted}T10:05:00Z`, from: "wire.advices@jpm-treasury.test", to: ["treasury@northwind.test"], cc: ["ar@northwind.test"],
    subject: `Credit advice: incoming wire ${r.trn}`,
    body: [
      "INCOMING INTERNATIONAL WIRE - CREDIT ADVICE", "",
      "Beneficiary: NORTHWIND SYSTEMS INC", "Account credited: USD operating account ending 4417", `Value date: ${r.posted}`, `Transaction reference (TRN): ${r.trn}`, "",
      "Originator: VOSSBERG LOGISTIK GMBH, Hamburg, DE", "Originator's bank: HAMBURGER HANDELSBANK AG, Hamburg", `Remittance information: ${r.invoice}`, "Details of charges: SHA", "",
      `Amount received: EUR ${usd(r.eur_cents)}`, `Exchange rate applied: ${ratePlain(r.rate_ppm)} USD per EUR`, `USD equivalent: ${usd(gross)}`,
      `Incoming wire fee: USD ${usd(r.fee_cents)}`, `Net credit: USD ${usd(gross - r.fee_cents)}`, "",
      "The payment was received in a currency other than that of the beneficiary account and was converted at the bank's rate on the value date.",
      "This advice is for information. It is not a statement of account.",
    ].join("\n"),
  };
}

/** A payment advice as a German customer's AP run sends it: one line per invoice, gross, deduction, net. */
function zahlungsavis(r: EurReceipt): WorldMail {
  const inv = EUR_INVOICES.find((e) => e.id === r.invoice)!;
  return {
    id: `gj-m-avis-${r.id}`, thread_id: `gj-t-avis-${r.id}`, date: `${addDays(r.posted, -1)}T14:30:00Z`, from: "kreditoren@vossberg-logistik.test", to: ["ar@northwind.test"], cc: [],
    subject: `Zahlungsavis / remittance advice ${r.invoice}`, party_id: "vossberg",
    body: [
      "Vossberg Logistik GmbH - Kreditorenbuchhaltung / Accounts Payable", `Zahlungsavis / payment advice no. ${r.sap_doc}`, `Payment date: ${addDays(r.posted, -1)}   Value date: ${r.posted}   Payment method: foreign wire, EUR   Our vendor no.: 300417`, "",
      "Invoice      Invoice date   Gross EUR      Deduction EUR   Net EUR",
      `${inv.id}     ${inv.issue}     ${usd(inv.eur_cents).padStart(10)}     ${usd(r.withheld_eur_cents).padStart(9)}       ${usd(r.eur_cents).padStart(10)}`, "",
      `Invoice ${inv.id}, invoice amount EUR ${usd(inv.eur_cents)}. Less EUR ${usd(r.withheld_eur_cents)} withheld re the service outage of 17 to 18 June (your ticket NW-48213), 2% service credit requested on 18 June. Payment EUR ${usd(r.eur_cents)}, value ${r.posted}.`,
      "", "Queries: kreditoren@vossberg-logistik.test. This advice was generated automatically.",
    ].join("\n"),
  };
}

/** The request and the honest reply. Together they prove what the customer wants and that nobody has agreed to it. */
function vossbergThread(): WorldMail[] {
  const t = "gj-t-vossberg-credit";
  return [
    { id: "gj-m-vossberg-1", thread_id: t, date: "2026-06-18T13:10:00Z", from: "j.brandt@vossberg-logistik.test", to: ["sam.okafor@northwind.test"], cc: ["kreditoren@vossberg-logistik.test"], subject: "Service credit - outage 17/18 June (NW-48213)", party_id: "vossberg",
      body: "Hello Sam,\n\nLast night's outage of the tracking API (your ticket NW-48213) ran for about nine hours. Our night hub in Hamburg and the early shift in Bremerhaven worked from paper, and two customers of ours have already asked for an explanation.\n\nPlease treat this email as our request for the 2% service credit under section 7 of the order form. Until it is settled our accounts payable team will hold back 2% on the invoices they pay.\n\nRegards,\nJonas Brandt\nDirector Operations, Vossberg Logistik GmbH" },
    { id: "gj-m-vossberg-2", thread_id: t, date: "2026-06-18T16:45:00Z", from: "sam.okafor@northwind.test", to: ["j.brandt@vossberg-logistik.test"], cc: [], subject: "Re: Service credit - outage 17/18 June (NW-48213)", party_id: "vossberg",
      body: "Hi Jonas,\n\nUnderstood, and sorry again for last night. I have logged your request and passed it to our finance team. I cannot confirm a credit myself: under section 7 a service credit is at Northwind's discretion and only takes effect when one of our officers confirms it in writing, and it is then issued as a credit note rather than held back from a payment. I will come back to you as soon as I have an answer.\n\nSam Okafor\nNorthwind Systems" },
  ];
}

// Ids 3, 6 and 7, and chat ids 1 to 5, were used by an earlier draft of this world that reached the live mailbox and
// workspace. A seeder skips an id it has already placed, so changed content takes a new id.
function noise(): WorldMail[] {
  const rows: Array<[id: string, date: string, from: string, subject: string, body: string, party?: string]> = [
    ["gj-m-noise-8", "2026-07-01T07:30:00Z", "statements@jpm-treasury.test", "Your June statements are available", "Statements for your accounts ending 4417 and 4425 for the period ending 30 June 2026 are available in online banking."],
    ["gj-m-noise-4", "2026-07-02T13:00:00Z", "priya.raman@northwind.test", "July close calendar", "Cash and AR by working day 3, accruals by working day 4, flux review on working day 5. Open reconciling items to me by end of day 2."],
    ["gj-m-noise-5", "2026-07-10T09:15:00Z", "ap@pallistermfg.test", "Updated remit-to confirmation", "We have your remit-to details on file for JPMorgan Chase, account ending 4417. No change requested. Pallister Manufacturing AP", "pallister"],
    ["gj-m-noise-9", "2026-07-06T11:10:00Z", "kreditoren@vossberg-logistik.test", "Invoices INV-3201 and INV-3202 received", "We confirm receipt of invoices INV-3201 dated 15 June 2026 and INV-3202 dated 1 July 2026. They are scheduled in our payment runs of 14 and 21 July.", "vossberg"],
    ["gj-m-noise-10", "2026-07-20T16:05:00Z", "ap@fernhillfoods.test", "July invoice INV-3221", "INV-3221 is approved and will be paid in our month-end run on 31 July. Fernhill Foods Accounts Payable", "fernhill"],
  ];
  return rows.map(([id, date, from, subject, body, party]) => ({ id, thread_id: id.replace("gj-m-", "gj-t-"), date, from, to: ["ar@northwind.test"], cc: [], subject, body, ...(party ? { party_id: party } : {}) }));
}

/** Lane A's Slack message about the outage, word for word; its trace in `mainScene.ts` is not exported, so it is asserted in the test. */
export const VOSSBERG_OUTAGE_SLACK = "Vossberg's tracking API was down for about nine hours overnight (NW-48213). Their ops director wants to talk about a credit. I have not promised anything.";

/** The outage as the company talked about it. It proves the outage and its length. It authorises nothing. */
function buildChat(): World["chat"] {
  const fromLaneA = DOCUMENTS.filter((d) => d.source === "slack").map((d, i) => ({
    id: `gj-c-a${i + 1}`, channel: d.payload.channel!.replace(/^#/, ""), user: "U_SAM", ts: d.at, text: d.payload.text!, ...(d.party_id ? { party_id: d.party_id } : {}),
  }));
  return [
    ...fromLaneA,
    { id: "gj-c-11", channel: "cs-escalations", user: "U_SAM", ts: "2026-06-18T08:40:00Z", text: VOSSBERG_OUTAGE_SLACK, party_id: "vossberg" },
    { id: "gj-c-12", channel: "cs-escalations", user: "U_SAM", ts: "2026-06-18T16:50:00Z", text: "Vossberg have now asked in writing for the 2% under section 7 and say their AP will hold it back on what they pay until it is settled. I told Jonas Brandt I cannot confirm a credit. Who signs these off?", party_id: "vossberg" },
    { id: "gj-c-13", channel: "cs-escalations", user: "U_CTRL", ts: "2026-06-18T17:20:00Z", text: "Section 7 credits are discretionary and need an officer in writing, so Alex. Nothing is approved for Vossberg yet. If they short-pay before it is, AR holds the difference as disputed and we do not write it off.", party_id: "vossberg" },
    { id: "gj-c-14", channel: "finance", user: "U_CTRL", ts: "2026-07-01T14:00:00Z", text: "June is closed. Vossberg's EUR 100,000 for Q3 was open at month end, so it was remeasured at 1.0900 and that reversed this morning. We still have no EUR account, so their wires get converted by JPMorgan on the way in, at JPMorgan's rate.", party_id: "vossberg" },
  ];
}

function buildCrm(contracts: WorldContract[]): World["crm"] {
  const names = new Map([...CUSTOMERS, VOSSBERG].map((c) => [c.id, c] as const));
  const deals = contracts.map((c) => ({
    id: `DEAL-${c.id}`, party_id: c.party_id, name: `${names.get(c.party_id)!.name} ${c.start_date.slice(0, 4)} subscription`, amount_cents: c.value_cents,
    close_date: c.recorded_time.slice(0, 10), owner: names.get(c.party_id)!.owner, stage: "closedwon", recorded_time: c.recorded_time,
  }));
  const notes = [
    { id: "GJ-N-1", party_id: "vossberg", ts: "2026-03-20T16:30:00Z", author: "U_SAM", text: "Vossberg signed the EU data residency add-on: EUR 25,000 a month from 1 April, on top of the EUR 100,000 quarterly platform fee. Their treasury pays everything by euro wire from Hamburg." },
    { id: "GJ-N-2", party_id: "vossberg", ts: "2026-06-18T17:00:00Z", author: "U_SAM", text: "Jonas Brandt asked in writing for the 2% service credit after the 17/18 June outage (NW-48213). Not confirmed by us. Passed to finance." },
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
      { slug: "foreign-currency", heading: "6. Foreign-currency receivables", text: "An invoice in a foreign currency is recorded in US dollars at the exchange rate on the invoice date. When it is paid, the difference between that rate and the rate the bank applied to the receipt is a realised exchange gain or loss (7100). It is arithmetic on the bank's own advice, not a concession, and it is never netted against a customer's deduction. Foreign-currency receivables still open at month end are remeasured at the closing rate (7150) and the remeasurement is reversed on the first day of the next month." },
      { slug: "customer-deductions", heading: "7. Customer deductions and service credits", text: "A deduction is not accepted because a customer took it. A service credit is due only as the customer's order form provides and only once an officer has confirmed it in writing; it is then issued as a credit note. Until then the unpaid amount stays open on the invoice as disputed. It is not written off and it is not booked as a discount." },
    ],
  };
}

function answerKey(): AnswerKeyItem[] {
  const eur = EUR_RECEIPTS.map((r): AnswerKeyItem => {
    const inv = EUR_INVOICES.find((e) => e.id === r.invoice)!;
    const received = convert(r.eur_cents, r.rate_ppm) - r.fee_cents;
    const causes = { fx_loss_cents: convert(r.eur_cents, EUR_BOOKED_PPM) - convert(r.eur_cents, r.rate_ppm), bank_fee_cents: r.fee_cents, withheld_cents: convert(r.withheld_eur_cents, EUR_BOOKED_PPM) };
    const held = `EUR ${usd(r.withheld_eur_cents)} (USD ${usd(causes.withheld_cents)})`;
    return {
      plant: r.id === "BTX-320" ? "eur_wire_three_causes" : "eur_wire_in_scope_reuse", party_id: "vossberg", bank_txn_id: r.id, doc_ids: [r.invoice],
      shortfall_cents: convert(inv.eur_cents, EUR_BOOKED_PPM) - received, causes,
      explained_by: `mail:gj-m-advice-${r.id}, mail:gj-m-avis-${r.id}, order form section 7; no officer has confirmed the credit`,
      expected: r.id === "BTX-320"
        ? `apply_payment AUTO; write_off of the fee to 6150 under the wire-fee rule; fx_realized to 7100 re-performed from the advice (F9); the withheld ${held} ESCALATE once, then credit_memo Dr 2400 with a person's approval, remembered as a standing 2% for this customer`
        : `same first three entries from code; the withheld ${held} prepared from the standing answer with nobody asked, parked because it is over USD 500. Only if that answer was standing: a one-time answer must ask again`,
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
