import { ACCOUNTS } from "../contract/accounts.js";
import { SEED_ACCOUNTS } from "../ledger/accounts.js";
import { World, type AnswerKeyItem, type WorldBankTxn, type WorldBill, type WorldContract, type WorldInvoice, type WorldMail, type WorldParty } from "./world.js";

export const DEFAULT_SEED = 20260719;

/** mulberry32: small, seedable, and the same on every machine. Math.random is never used in the world. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
const date = (month: number, day: number): string => `2026-${pad(month)}-${pad(day)}`;
const usd = (cents: number): string => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface CustomerDef { id: string; name: string; bank: string; domain: string; monthly: number; method: "ach" | "wire"; owner: string; parent?: string }

// Index 5 must stay Initech: July invoices are numbered from INV-1037, which makes Initech's INV-1042 (spec §4).
const CUSTOMERS: CustomerDef[] = [
  { id: "acme", name: "Acme Corp", bank: "ACME CORP", domain: "acme.test", monthly: 850_000, method: "ach", owner: "U_SAM" },
  { id: "globex-labs", name: "Globex Labs", bank: "GLOBEX LABS INC", domain: "globexlabs.test", monthly: 1_500_000, method: "ach", owner: "U_DANA", parent: "globex-holdings" },
  { id: "soylent", name: "Soylent Foods", bank: "SOYLENT FOODS CO", domain: "soylent.test", monthly: 620_000, method: "ach", owner: "U_JORDAN" },
  { id: "umbrella", name: "Umbrella Health", bank: "UMBRELLA HEALTH", domain: "umbrellahealth.test", monthly: 990_000, method: "ach", owner: "U_SAM" },
  { id: "stark", name: "Stark Industries", bank: "STARK INDUSTRIES", domain: "stark.test", monthly: 2_500_000, method: "wire", owner: "U_JORDAN" },
  { id: "initech", name: "Initech", bank: "INITECH LLC", domain: "initech.test", monthly: 1_200_000, method: "ach", owner: "U_DANA" },
  { id: "hooli", name: "Hooli", bank: "HOOLI INC", domain: "hooli.test", monthly: 1_800_000, method: "ach", owner: "U_JORDAN" },
  { id: "pied-piper", name: "Pied Piper", bank: "PIED PIPER INC", domain: "piedpiper.test", monthly: 480_000, method: "ach", owner: "U_DANA" },
  { id: "vandelay", name: "Vandelay Imports", bank: "VANDELAY IMPORTS", domain: "vandelay.test", monthly: 730_000, method: "wire", owner: "U_SAM" },
  { id: "cyberdyne", name: "Cyberdyne Systems", bank: "CYBERDYNE SYSTEMS", domain: "cyberdyne.test", monthly: 2_100_000, method: "ach", owner: "U_JORDAN" },
  { id: "tyrell", name: "Tyrell Corp", bank: "TYRELL CORP", domain: "tyrell.test", monthly: 1_140_000, method: "ach", owner: "U_DANA" },
  { id: "wayne", name: "Wayne Enterprises", bank: "WAYNE ENTERPRISES", domain: "wayne.test", monthly: 3_300_000, method: "ach", owner: "U_SAM" },
];

interface VendorDef { id: string; name: string; bank: string; monthly: number; account: string }

const VENDORS: VendorDef[] = [
  { id: "nimbus-cloud", name: "Nimbus Cloud", bank: "NIMBUS CLOUD INC", monthly: 1_840_000, account: SEED_ACCOUNTS.hosting },
  { id: "observa", name: "Observa Monitoring", bank: "OBSERVA INC", monthly: 320_000, account: SEED_ACCOUNTS.software },
  { id: "slate-crm", name: "Slate CRM", bank: "SLATE CRM", monthly: 275_000, account: SEED_ACCOUNTS.software },
  { id: "brightline-legal", name: "Brightline Legal LLP", bank: "BRIGHTLINE LEGAL", monthly: 600_000, account: SEED_ACCOUNTS.professional_fees },
  { id: "kessler-roe", name: "Kessler & Roe CPA", bank: "KESSLER ROE CPA", monthly: 450_000, account: SEED_ACCOUNTS.professional_fees },
  { id: "meridian-reit", name: "Meridian Office REIT", bank: "MERIDIAN OFFICE REIT", monthly: 1_400_000, account: SEED_ACCOUNTS.office },
  { id: "pixel-pine", name: "Pixel & Pine Marketing", bank: "PIXEL AND PINE", monthly: 800_000, account: SEED_ACCOUNTS.marketing },
  { id: "cobalt-telecom", name: "Cobalt Telecom", bank: "COBALT TELECOM", monthly: 115_000, account: SEED_ACCOUNTS.office },
  { id: "harbor-insurance", name: "Harbor Insurance", bank: "HARBOR INS CO", monthly: 230_000, account: SEED_ACCOUNTS.office },
  { id: "quill-supplies", name: "Quill Supplies", bank: "QUILL SUPPLIES", monthly: 64_000, account: SEED_ACCOUNTS.office },
];

const PEOPLE = [
  { id: "U_CEO", name: "Morgan Hale", role: "ceo", email: "morgan.hale@northwind.test" },
  { id: "U_CFO", name: "Alex Moreau", role: "cfo", email: "alex.moreau@northwind.test", limit_cents: 10_000_000 },
  { id: "U_CTRL", name: "Priya Raman", role: "controller", email: "priya.raman@northwind.test", limit_cents: 1_000_000 },
  { id: "U_AP", name: "Lee Tanaka", role: "ap_clerk", email: "lee.tanaka@northwind.test", limit_cents: 10_000 },
  { id: "U_DANA", name: "Dana Reyes", role: "account_owner", email: "dana.reyes@northwind.test" },
  { id: "U_SAM", name: "Sam Okafor", role: "account_owner", email: "sam.okafor@northwind.test" },
  { id: "U_JORDAN", name: "Jordan Pike", role: "account_owner", email: "jordan.pike@northwind.test" },
];

/** Q2 wire fees the humans wrote off. One went to the wrong account on purpose: replay must call it inconsistent. */
const WIRE_FEES: Array<{ cents: number; account: string }> = [
  { cents: 1500, account: ACCOUNTS.bank_charges }, { cents: 2500, account: ACCOUNTS.bank_charges },
  { cents: 3500, account: ACCOUNTS.bank_charges }, { cents: 2000, account: ACCOUNTS.misc_expense },
  { cents: 4500, account: ACCOUNTS.bank_charges }, { cents: 1000, account: ACCOUNTS.bank_charges },
];

const OPENING_CASH = 500_000_000;
const HISTORY_MONTHS = [4, 5, 6];
const LIVE_MONTH = 7;

type DraftTxn = Omit<WorldBankTxn, "id"> & { tag?: string };

export function generateWorld(seed: number = DEFAULT_SEED): { world: World; answerKey: AnswerKeyItem[] } {
  const rnd = prng(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  const stamp = (iso: string): string => `${iso}T${pad(int(13, 21))}:${pad(int(0, 59))}:00Z`;

  const parties = buildParties();
  const contracts = buildContracts();
  const invoices: WorldInvoice[] = [];
  const bills: WorldBill[] = [];
  const txns: DraftTxn[] = [{
    posted_date: date(4, 1), amount_cents: OPENING_CASH, descriptor: "WIRE IN NORTHWIND SYSTEMS FUNDING TRANSFER", method: "wire",
    recorded_time: `${date(4, 1)}T13:00:00Z`, history: { doc_kind: "equity", applied_cents: OPENING_CASH },
  }];

  let invoiceNo = 1001;
  let wireFee = 0;
  for (const month of [...HISTORY_MONTHS, LIVE_MONTH]) {
    for (const c of CUSTOMERS) {
      const id = `INV-${invoiceNo++}`;
      const contractId = c.id === "initech" && month < LIVE_MONTH ? "CTR-initech-2025" : `CTR-${c.id}-2026`;
      invoices.push({ id, party_id: c.id, contract_id: contractId, issue_date: date(month, 1), due_date: addDays(date(month, 1), 30), total_cents: c.monthly });
      if (month === LIVE_MONTH) continue;
      const posted = date(month, int(12, 26));
      if (c.method === "wire") {
        const fee = WIRE_FEES[wireFee++ % WIRE_FEES.length]!;
        txns.push({
          posted_date: posted, amount_cents: c.monthly - fee.cents, descriptor: `WIRE IN ${c.bank} REF ${id}`, method: "wire", recorded_time: stamp(posted),
          history: { doc_kind: "invoice", doc_id: id, applied_cents: c.monthly - fee.cents, write_off: { account: fee.account, amount_cents: fee.cents, decided_at: `${addDays(posted, 1)}T15:00:00Z` } },
        });
      } else {
        txns.push({
          posted_date: posted, amount_cents: c.monthly, descriptor: `ACH CREDIT ${c.bank} ${id}`, method: "ach", recorded_time: stamp(posted),
          history: { doc_kind: "invoice", doc_id: id, applied_cents: c.monthly },
        });
      }
    }
    for (const v of VENDORS) {
      const id = `BILL-${pad(month)}-${v.id}`;
      bills.push({
        id, party_id: v.id, vendor_invoice_no: `${v.bank.split(" ")[0]}-2026${pad(month)}-${int(100, 999)}`, bill_date: date(month, 5),
        due_date: addDays(date(month, 5), 30), service_period: `2026-${pad(month)}`, total_cents: v.monthly, expense_account: v.account,
      });
      if (month === LIVE_MONTH) continue;
      const posted = date(month, int(24, 28));
      txns.push({
        posted_date: posted, amount_cents: -v.monthly, descriptor: `ACH DEBIT ${v.bank}`, method: "ach", recorded_time: stamp(posted),
        history: { doc_kind: "bill", doc_id: id, applied_cents: v.monthly },
      });
    }
  }

  const julyInvoice = (partyId: string): WorldInvoice => invoices.find((i) => i.party_id === partyId && i.issue_date === date(LIVE_MONTH, 1))!;
  const mail: WorldMail[] = [];
  const julyReceipt = (c: CustomerDef, day: number, cents: number, descriptor: string, tag?: string): void => {
    const posted = date(LIVE_MONTH, day);
    txns.push({ posted_date: posted, amount_cents: cents, descriptor, method: c.method, recorded_time: stamp(posted), tag });
  };

  for (const c of CUSTOMERS) {
    const inv = julyInvoice(c.id);
    switch (c.id) {
      case "initech": // plant: short by exactly the 10% the CEO granted by email on 28 Jun
        julyReceipt(c, 12, 1_080_000, `ACH CREDIT ${c.bank} ${inv.id}`, "initech");
        break;
      case "wayne": // plant: $3,300 short and nothing anywhere explains it
        julyReceipt(c, 15, 2_970_000, `ACH CREDIT ${c.bank}`, "wayne");
        break;
      case "globex-labs": // plant: the parent pays for the subsidiary, explained only in one email
        julyReceipt(c, int(9, 22), c.monthly, "ACH CREDIT GLOBEX HOLDINGS LTD", "globex");
        break;
      case "umbrella": // plant: pays two weeks late, so no July cash at all
        break;
      case "hooli": // clean, but the bank line names no invoice; a remittance email does
        julyReceipt(c, 16, c.monthly, `ACH CREDIT ${c.bank} PAYMENT`);
        mail.push(remittance(c, inv, date(LIVE_MONTH, 16)));
        break;
      default:
        if (c.method === "wire") julyReceipt(c, int(9, 22), c.monthly - (c.id === "stark" ? 2500 : 3500), `WIRE IN ${c.bank} REF ${inv.id}`, `wire-${c.id}`);
        else {
          const day = int(8, 24);
          julyReceipt(c, day, c.monthly, `ACH CREDIT ${c.bank} ${inv.id}`);
          if (rnd() < 0.5) mail.push(remittance(c, inv, date(LIVE_MONTH, day)));
        }
    }
  }

  txns.sort((a, b) => (a.posted_date + a.recorded_time + a.descriptor < b.posted_date + b.recorded_time + b.descriptor ? -1 : 1));
  const bankTxns = txns.map((t, i) => ({ ...t, id: `BTX-${pad(i + 1, 4)}` }));
  const tagged = (tag: string): string => bankTxns.find((t) => t.tag === tag)!.id;

  mail.push(...storyMail(), ...noiseMail(int));
  mail.sort((a, b) => (a.date < b.date ? -1 : 1));

  const world = World.parse({
    meta: { seed, company: "Northwind Systems", version: 0, live_period: "2026-07", history_periods: ["2026-04", "2026-05", "2026-06"] },
    periods: [
      { id: "2026-04", status: "locked" }, { id: "2026-05", status: "locked" }, { id: "2026-06", status: "locked" },
      { id: "2026-07", status: "open" }, { id: "2026-08", status: "open" },
    ],
    people: PEOPLE,
    parties,
    contracts,
    invoices,
    bills,
    bank: { account: "operating", opening_balance_cents: 0, txns: bankTxns.map(({ tag: _tag, ...t }) => t) },
    mail,
    chat: storyChat(),
    crm: buildCrm(contracts),
    files: [policyMemo()],
  });

  const answerKey: AnswerKeyItem[] = [
    { plant: "initech_ceo_concession", party_id: "initech", bank_txn_id: tagged("initech"), doc_ids: [julyInvoice("initech").id], shortfall_cents: 120_000, explained_by: "mail:m-initech-2", expected: "apply_payment AUTO; credit_memo Dr 2400 / Cr 1200 PROPOSE, quoting the CEO email" },
    { plant: "wayne_unexplained_short_pay", party_id: "wayne", bank_txn_id: tagged("wayne"), doc_ids: [julyInvoice("wayne").id], shortfall_cents: 330_000, expected: "apply_payment AUTO; shortfall ESCALATE to U_SAM, asked once" },
    { plant: "parent_pays_for_subsidiary", party_id: "globex-labs", bank_txn_id: tagged("globex"), doc_ids: [julyInvoice("globex-labs").id], shortfall_cents: 0, explained_by: "mail:m-globex-1", expected: "unidentified deposit from globex-holdings; alias learned, then applied to Globex Labs" },
    { plant: "late_payer", party_id: "umbrella", doc_ids: [julyInvoice("umbrella").id], shortfall_cents: 990_000, explained_by: "mail:m-umbrella-1", expected: "no July cash; forecast moves the receipt to the first week of August" },
    { plant: "wire_fee", party_id: "stark", bank_txn_id: tagged("wire-stark"), doc_ids: [julyInvoice("stark").id], shortfall_cents: 2500, expected: "write_off to 6150 once the Q2 policy is compiled and approved; before that PROPOSE or ESCALATE" },
    { plant: "wire_fee", party_id: "vandelay", bank_txn_id: tagged("wire-vandelay"), doc_ids: [julyInvoice("vandelay").id], shortfall_cents: 3500, expected: "same as stark" },
  ];
  return { world, answerKey };
}

function buildParties(): WorldParty[] {
  const customers: WorldParty[] = CUSTOMERS.map((c) => ({
    id: c.id, kind: "customer", name: c.name, parent_id: c.parent, owner: c.owner, aliases: [c.bank, c.name, c.domain], email_domain: c.domain,
  }));
  const parent: WorldParty = { id: "globex-holdings", kind: "customer", name: "Globex Holdings Ltd", owner: "U_DANA", aliases: ["GLOBEX HOLDINGS LTD", "Globex Holdings Ltd"] };
  const vendors: WorldParty[] = VENDORS.map((v, i) => ({
    id: v.id, kind: "vendor", name: v.name, aliases: [v.bank, v.name], default_expense_account: v.account,
    remit_to: { bank: "First Harbor Bank", routing: `0210000${pad(i + 10)}`, account_last4: pad(4100 + i * 37, 4) },
  }));
  const other: WorldParty = { id: "unidentified", kind: "other", name: "Unidentified payer", aliases: [] };
  return [...customers.slice(0, 2), parent, ...customers.slice(2), ...vendors, other];
}

function buildContracts(): WorldContract[] {
  const out: WorldContract[] = [];
  for (const c of CUSTOMERS) {
    const initech = c.id === "initech";
    if (initech) out.push(contract(c, "CTR-initech-2025", "2025-07-01", "2026-06-30", "2025-06-20T16:00:00Z"));
    out.push(contract(c, `CTR-${c.id}-2026`, initech ? "2026-07-01" : "2026-01-01", initech ? "2027-06-30" : "2026-12-31", initech ? "2026-06-24T16:00:00Z" : "2025-12-15T16:00:00Z"));
  }
  return out;
}

function contract(c: CustomerDef, id: string, start: string, end: string, recorded: string): WorldContract {
  const text = [
    `# Master Subscription Agreement - ${c.name}`,
    `Contract ${id} between Northwind Systems, Inc. and ${c.name}.`,
    `## 1. Fees\nThe platform fee is ${usd(c.monthly)} per month, ${usd(c.monthly * 12)} for the term, invoiced monthly in advance on the first day of each month.`,
    `## 2. Payment terms\nInvoices are due net 30 days from the invoice date, payable by ${c.method === "wire" ? "wire transfer" : "ACH"}. Bank charges are for the account of the payer.`,
    `## 3. Term and renewal\nThe term runs from ${start} to ${end} and renews for successive twelve-month terms unless either party gives sixty days notice.`,
    "## 4. Changes to fees\nAny change to the fees, including a discount or credit, is effective only if agreed in writing by an officer of Northwind Systems.",
  ].join("\n\n");
  return {
    id, party_id: c.id, start_date: start, end_date: end, value_cents: c.monthly * 12,
    terms: { monthly_cents: c.monthly, billing: "monthly", payment_terms_days: 30, method: c.method }, text, recorded_time: recorded,
  };
}

function remittance(c: CustomerDef, inv: WorldInvoice, day: string): WorldMail {
  return {
    id: `m-remit-${inv.id}`, thread_id: `t-remit-${inv.id}`, date: `${day}T11:30:00Z`, from: `ap@${c.domain}`, to: ["ar@northwind.test"], cc: [],
    subject: `Remittance advice - ${c.name}`, party_id: c.id,
    body: `Remittance advice from ${c.name} accounts payable.\n\nPayment of ${usd(inv.total_cents)} sent today covers invoice ${inv.id} in full.\n\nThis mailbox is not monitored.`,
  };
}

function storyMail(): WorldMail[] {
  return [
    {
      id: "m-initech-1", thread_id: "t-initech-pricing", date: "2026-06-26T14:12:00Z", from: "pat.lindqvist@initech.test", to: ["morgan.hale@northwind.test"], cc: ["dana.reyes@northwind.test"],
      subject: "Renewal pricing", party_id: "initech",
      body: "Morgan,\n\nGood to talk today. As discussed, the May outage cost us two days of reporting and my board wants to see that reflected before we sign the renewal. Can you confirm the discount in writing so I can get the order form through?\n\nPat Lindqvist\nCFO, Initech",
    },
    {
      id: "m-initech-2", thread_id: "t-initech-pricing", date: "2026-06-28T15:00:00Z", from: "morgan.hale@northwind.test", to: ["pat.lindqvist@initech.test"], cc: ["dana.reyes@northwind.test"],
      subject: "Re: Renewal pricing", party_id: "initech",
      body: "Hi Pat, Dana,\n\nConfirming what we discussed: Initech gets 10% off the platform fee through renewal on 2027-06-30. Billing will not catch up for a cycle or two, so invoices may still show the list price. Pay the net amount and we will true it up on our side.\n\nThanks,\nMorgan Hale\nCEO, Northwind Systems",
    },
    {
      id: "m-globex-1", thread_id: "t-globex-treasury", date: "2026-06-30T09:40:00Z", from: "ap@globexlabs.test", to: ["ar@northwind.test"], cc: [],
      subject: "Change of paying entity from July", party_id: "globex-labs",
      body: "Hello,\n\nFollowing our treasury centralisation, invoices addressed to Globex Labs will be paid by our parent company, Globex Holdings Ltd, starting with the July invoice. Payments will show GLOBEX HOLDINGS LTD as the originator. Invoice addressing does not change.\n\nGlobex Labs Accounts Payable",
    },
    {
      id: "m-umbrella-1", thread_id: "t-umbrella-delay", date: "2026-07-20T16:05:00Z", from: "ap@umbrellahealth.test", to: ["ar@northwind.test"], cc: ["sam.okafor@northwind.test"],
      subject: "July payment timing", party_id: "umbrella",
      body: "Hi,\n\nWe are migrating ERP systems and our July payment run is delayed. Expect payment of the July invoice in full in the first week of August. Apologies for the inconvenience.\n\nUmbrella Health AP",
    },
    {
      id: "m-wayne-1", thread_id: "t-wayne-qbr", date: "2026-07-09T18:20:00Z", from: "sam.okafor@northwind.test", to: ["lucius.f@wayne.test"], cc: [],
      subject: "QBR follow-up", party_id: "wayne",
      body: "Lucius,\n\nThanks for the time today. Slides attached. I will send the usage export your analysts asked for by Friday.\n\nSam",
    },
  ];
}

function noiseMail(int: (lo: number, hi: number) => number): WorldMail[] {
  const subjects = [
    ["Your July statement is ready", "statements@firstharbor.test", "Your operating account statement for the period is available in online banking."],
    ["SaaS Finance Weekly: five close metrics that matter", "newsletter@saasfinanceweekly.test", "This week: days to close, the cost of a reopened period, and why accruals go stale."],
    ["Office closure notice", "facilities@meridianreit.test", "The lobby will be closed for maintenance on Saturday. Badge access is unaffected."],
    ["Invitation: July close kickoff", "priya.raman@northwind.test", "Agenda: checklist owners, accrual cut-off, open reconciling items. Thirty minutes."],
    ["Updated W-9 on file", "ap@quillsupplies.test", "Attached is our updated W-9 for your records. No change to remittance details."],
    ["Re: dashboard export", "lucius.f@wayne.test", "Got the export, thanks Sam. The analysts are happy with it."],
  ] as const;
  return subjects.map(([subject, from, body], i) => ({
    id: `m-noise-${i + 1}`, thread_id: `t-noise-${i + 1}`, date: `${date(LIVE_MONTH, int(1, 24))}T${pad(int(13, 21))}:${pad(int(0, 59))}:00Z`,
    from, to: ["ar@northwind.test"], cc: [], subject, body, ...(from.endsWith("wayne.test") ? { party_id: "wayne" } : {}),
  }));
}

function storyChat(): World["chat"] {
  return [
    { id: "c-1", channel: "deals", user: "U_DANA", ts: "2026-06-24T17:45:00Z", text: "Initech renewal is signed. 144k for the year, same list price as last term. Logged in the CRM.", party_id: "initech" },
    { id: "c-2", channel: "finance", user: "U_CTRL", ts: "2026-07-01T14:00:00Z", text: "July invoices are out. Close calendar is pinned: cash and AR by the 3rd working day of August." },
    { id: "c-3", channel: "cs-escalations", user: "U_SAM", ts: "2026-07-07T15:30:00Z", text: "Wayne reported slow dashboards on Monday. Root cause was a cold cache, fixed the same day. Ticket closed, nothing commercial came up.", party_id: "wayne" },
    { id: "c-4", channel: "finance", user: "U_AP", ts: "2026-07-06T13:10:00Z", text: "July vendor bills are all in the AP inbox except the cloud bill, which usually lands in the first days of the next month." },
    { id: "c-5", channel: "finance", user: "U_CTRL", ts: "2026-07-21T16:20:00Z", text: "Umbrella told Sam their July payment slips to early August. Forecast should move it.", party_id: "umbrella" },
  ];
}

function buildCrm(contracts: WorldContract[]): World["crm"] {
  const deals = contracts.map((c) => {
    const cust = CUSTOMERS.find((x) => x.id === c.party_id)!;
    // planted drift: Initech's deal stays at list ($144k) while cash now runs at $129.6k
    return { id: `DEAL-${c.id}`, party_id: c.party_id, name: `${cust.name} ${c.start_date.slice(0, 4)} subscription`, amount_cents: c.value_cents, close_date: c.recorded_time.slice(0, 10), owner: cust.owner, stage: "closedwon", recorded_time: c.recorded_time };
  });
  const notes = [
    { id: "N-1", party_id: "initech", ts: "2026-06-24T17:50:00Z", author: "U_DANA", text: "Renewal closed at list. Morgan is handling a pricing conversation with Pat Lindqvist (CFO) directly after the May outage." },
    { id: "N-2", party_id: "wayne", ts: "2026-07-09T19:00:00Z", author: "U_SAM", text: "QBR held 9 Jul. Usage up 12%. No commercial issues raised. Next touchpoint in October." },
    { id: "N-3", party_id: "globex-labs", ts: "2026-06-30T10:00:00Z", author: "U_DANA", text: "Globex is centralising treasury under Globex Holdings. Contracting entity stays Globex Labs." },
  ];
  return { deals, notes };
}

function policyMemo(): World["files"][number] {
  return {
    id: "policy-memo", kind: "policy_memo", title: "Northwind Systems accounting policy memo (FY2026)", recorded_time: "2026-01-05T15:00:00Z",
    sections: [
      { slug: "materiality", heading: "1. Materiality and approval", text: "Any adjustment of $500.00 or more (a credit memo, write-off, accrual or reclass) requires approval by a person with sufficient authority before it posts. A cash application that matches an invoice exactly is not an adjustment." },
      { slug: "approval-matrix", heading: "2. Approval matrix", text: "AP clerk: up to $100. Controller: up to $10,000. CFO: up to $100,000. Nobody approves an entry they prepared." },
      { slug: "concessions", heading: "3. Price concessions", text: "A price concession needs written agreement from an officer of the company. A concession on a term not yet recognised is booked against deferred revenue, not revenue, and the revenue schedule is revised prospectively." },
      { slug: "unapplied-cash", heading: "4. Unapplied and unidentified cash", text: "Cash that cannot be tied to a customer document is held in customer credits until identified. It is never applied to another customer's invoice." },
      { slug: "accruals", heading: "5. Accruals", text: "Services received but not yet billed at month end are accrued from the best available estimate and reversed when the bill arrives." },
    ],
  };
}
