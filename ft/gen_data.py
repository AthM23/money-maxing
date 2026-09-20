# Lane C — synthetic training data generator (Preet's call 09-19 ~21:00: don't block on the runtime).
# The generator IS the answer key: every document is rendered from a known ground-truth record, so labels
# are free and exact. Honesty guards (sheet 21 stage 4): splits hold out WHOLE vendors/customers AND whole
# template families, so test measures the skill, not memorization of the generator.
#
#   python3 ft/gen_data.py --out ft/data --n 3000 --seed 7
#
# Emits (same file contract as export.ts, so the trainers don't care which produced it):
#   sft.{train,cal,test}.jsonl  — head (e): document → JSON extraction, chat format
#   pairs.csv                   — head (b): bank line × invoice candidate pair features
#   coding.{train,test}.csv     — head (d): vendor/memo/amount → GL account
#   manifest.json               — counts, held-out entities, held-out template families
import argparse, csv, json, random, hashlib
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="ft/data")
ap.add_argument("--n", type=int, default=3000)
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
rng = random.Random(a.seed)
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- world
FIRST = ["Acme", "Initech", "Wayne", "Stark", "Globex", "Umbrella", "Hooli", "Vandelay", "Prestige", "Cyberdyne",
         "Wonka", "Dunder", "Pied", "Aperture", "Massive", "Soylent", "Tyrell", "Oscorp", "Gringotts", "Nakatomi",
         "Weyland", "Bluth", "Sterling", "Monarch", "Octan", "Zorg", "Virtucon", "InGen", "Rekall", "Yoyodyne"]
SECOND = ["Systems", "Corp", "Industries", "Labs", "Holdings", "Software", "Logistics", "Partners", "Group", "Dynamics"]
CUSTOMERS = [f"{f} {s}" for f in FIRST for s in SECOND][:120]
VENDORS = ["AWS", "Google Cloud", "Datadog", "Snowflake", "Gusto Payroll", "WeWork", "Salesforce", "Notion Labs",
           "Linear", "OpenPhone", "Rippling", "Deel Inc", "Brex", "NetSuite", "Zoom Video", "Slack Technologies",
           "Atlassian", "GitHub", "Figma", "Vercel", "Twilio", "Stripe Billing", "DocuSign", "Carta", "Mercury Bank",
           "Airtable", "Retool", "Segment", "Amplitude", "LaunchDarkly"]
ACCOUNTS = {  # tiny chart of accounts for head (d)
    "AWS": "6400 Cloud Infrastructure", "Google Cloud": "6400 Cloud Infrastructure", "Snowflake": "6400 Cloud Infrastructure",
    "Datadog": "6410 Monitoring & Tooling", "GitHub": "6410 Monitoring & Tooling", "Vercel": "6400 Cloud Infrastructure",
    "Gusto Payroll": "6000 Payroll", "Rippling": "6000 Payroll", "Deel Inc": "6000 Payroll",
    "WeWork": "6200 Rent & Facilities", "Zoom Video": "6300 Software Subscriptions", "Salesforce": "6300 Software Subscriptions",
    "Notion Labs": "6300 Software Subscriptions", "Linear": "6300 Software Subscriptions", "Slack Technologies": "6300 Software Subscriptions",
    "Atlassian": "6300 Software Subscriptions", "Figma": "6300 Software Subscriptions", "Airtable": "6300 Software Subscriptions",
    "Retool": "6300 Software Subscriptions", "Segment": "6300 Software Subscriptions", "Amplitude": "6300 Software Subscriptions",
    "LaunchDarkly": "6300 Software Subscriptions", "Twilio": "6420 Communications", "OpenPhone": "6420 Communications",
    "Stripe Billing": "6500 Payment Processing Fees", "Mercury Bank": "6510 Bank Fees", "Brex": "6510 Bank Fees",
    "DocuSign": "6300 Software Subscriptions", "Carta": "6600 Professional Services", "NetSuite": "6300 Software Subscriptions",
}
MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07"]

def cents(lo=5_000, hi=25_000_00): return rng.randint(lo, hi)
def dollars(c): return f"{c // 100:,}.{c % 100:02d}"
def day(month): return f"{month}-{rng.randint(1, 28):02d}"
def inv_no(): return f"INV-{rng.randint(1000, 9999)}"

# entity + template-family holdouts (deterministic by seed)
HELD_CUST = set(rng.sample(CUSTOMERS, 18)); HELD_VEND = set(rng.sample(VENDORS, 5))

# ---------------------------------------------------------------- head (e): document templates
# Each template family renders the SAME ground truth differently. Families 8-9 are test-only.
def t_remit_plain(g):
    return (f"REMITTANCE ADVICE\nFrom: {g['payer']}\nDate: {g['date']}\nWe have initiated payment of "
            f"${dollars(g['amount_cents'])} via {g['method']} for the following: "
            + "; ".join(f"{i['invoice']} (${dollars(i['amount_cents'])})" for i in g["applications"]) + "\nRef: {}".format(g["ref"]))
def t_remit_email(g):
    return (f"Subject: payment sent\nHi team,\n\nJust a heads up, we sent {g['payer']}'s payment today "
            f"({g['date']}) — total ${dollars(g['amount_cents'])} covering "
            + " and ".join(f"invoice {i['invoice']} for ${dollars(i['amount_cents'])}" for i in g["applications"])
            + f".\nIt should show as ref {g['ref']} on your end.\n\nBest,\nAP team, {g['payer']}")
def t_remit_terse(g):
    return (f"{g['date']} {g['method'].upper()} {g['ref']} {g['payer'].upper()} USD {dollars(g['amount_cents'])} "
            + " ".join(f"{i['invoice']}:{dollars(i['amount_cents'])}" for i in g["applications"]))
def t_remit_shortpay(g):
    exp = g["applications"][0]["amount_cents"]
    return (f"From: ap@{g['payer'].split()[0].lower()}.com\nSubject: RE: {g['applications'][0]['invoice']}\n\n"
            f"Per our agreement with your CEO ({g['discount_pct']}% partnership discount), we are remitting "
            f"${dollars(g['amount_cents'])} against {g['applications'][0]['invoice']} (original amount "
            f"${dollars(exp)}). Payment date {g['date']}, reference {g['ref']}.")
def t_bill_saas(g):
    return (f"{g['vendor']}\nTAX INVOICE {g['ref']}\nBill to: Northwind Systems\nInvoice date: {g['date']}\n"
            f"Service period: {g['period']}\n\nSubscription charges .......... ${dollars(g['amount_cents'])}\n"
            f"Total due: ${dollars(g['amount_cents'])}\nNet {g['terms_days']} days.")
def t_bill_usage(g):
    unit = rng.choice(["GB-hours", "requests (millions)", "seats", "compute units"])
    qty = rng.randint(10, 900)
    return (f"INVOICE\nVendor: {g['vendor']}\nNo: {g['ref']} | Issued {g['date']}\nUsage period {g['period']}\n"
            f"{qty} {unit} @ metered rate\nAmount due ...... USD {dollars(g['amount_cents'])}\n"
            f"Payment terms: net {g['terms_days']}.")
def t_contract_clause(g):
    return (f"Section 4.2 (Fees). Customer {g['payer']} shall pay an annual subscription fee of "
            f"${dollars(g['amount_cents'])}, invoiced {g['billing']} in advance, commencing {g['date']}. "
            f"{'A discount of ' + str(g['discount_pct']) + '% applies through the renewal date. ' if g['discount_pct'] else ''}"
            f"Fees increase {g['escalator_pct']}% annually beginning month 13.")
def t_remit_ocr(g):  # noisy OCR-ish: TEST-ONLY family
    s = t_remit_plain(g)
    noise = {"O": "0", "l": "1", ",": "", "  ": " "}
    for k, v in noise.items(): s = s.replace(k, v)
    return "SCANNED DOC (OCR)\n" + s
def t_bill_foreign(g):  # TEST-ONLY family: different layout conventions
    return (f"RECHNUNG / INVOICE {g['ref']}\n{g['vendor']} — issued {g['date']}\nLeistungszeitraum: {g['period']}\n"
            f"Betrag: {dollars(g['amount_cents'])} USD\nZahlbar innerhalb von {g['terms_days']} Tagen.")

FAMILIES = [("remit_plain", t_remit_plain, "remit"), ("remit_email", t_remit_email, "remit"),
            ("remit_terse", t_remit_terse, "remit"), ("remit_shortpay", t_remit_shortpay, "remit"),
            ("bill_saas", t_bill_saas, "bill"), ("bill_usage", t_bill_usage, "bill"),
            ("contract", t_contract_clause, "contract"),
            ("remit_ocr", t_remit_ocr, "remit"), ("bill_foreign", t_bill_foreign, "bill")]
TEST_ONLY_FAMILIES = {"remit_ocr", "bill_foreign"}

def make_ground(kind):
    month = rng.choice(MONTHS)
    if kind == "remit":
        n_inv = rng.choices([1, 2, 3], [0.6, 0.25, 0.15])[0]
        apps = [{"invoice": inv_no(), "amount_cents": cents()} for _ in range(n_inv)]
        disc = rng.choices([0, 5, 10, 15], [0.7, 0.1, 0.15, 0.05])[0]
        total = sum(i["amount_cents"] for i in apps)
        disc_cents = int(total * disc / 100) if disc else 0
        return {"doc_kind": "remittance", "payer": rng.choice(CUSTOMERS), "date": day(month),
                "amount_cents": total - disc_cents, "applications": apps, "discount_pct": disc,
                "discount_cents": disc_cents, "method": rng.choice(["ACH", "wire", "check"]),
                "ref": f"RMT{rng.randint(10000, 99999)}", "month": month}
    if kind == "bill":
        return {"doc_kind": "vendor_bill", "vendor": rng.choice(VENDORS), "date": day(month),
                "amount_cents": cents(50_00, 80_000_00), "period": f"{month}-01 to {month}-28",
                "terms_days": rng.choice([15, 30, 45]), "ref": f"B-{rng.randint(10000, 99999)}", "month": month}
    return {"doc_kind": "contract_clause", "payer": rng.choice(CUSTOMERS), "date": day(month),
            "amount_cents": cents(50_000_00, 400_000_00), "billing": rng.choice(["annually", "quarterly", "monthly"]),
            "discount_pct": rng.choices([0, 10], [0.8, 0.2])[0], "escalator_pct": rng.choice([3, 4, 5]),
            "ref": f"CTR-{rng.randint(100, 999)}", "month": month}

def label_of(g):  # the JSON the model must produce — exactly the generator's ground truth
    lab = {k: g[k] for k in g if k not in ("month",)}
    return json.dumps(lab, sort_keys=True)

def split_of(g, fam):
    ent = g.get("payer") or g.get("vendor")
    if fam in TEST_ONLY_FAMILIES or ent in HELD_CUST or ent in HELD_VEND or g["month"] == "2026-07":
        return "test"
    return "cal" if g["month"] == "2026-06" else "train"

buckets = {"train": [], "cal": [], "test": []}
seen = set()
while sum(len(b) for b in buckets.values()) < a.n:
    fam, render, kind = FAMILIES[rng.randrange(len(FAMILIES))]
    g = make_ground(kind)
    # a label must be inferable from the rendered document: only the shortpay template states a discount,
    # so every other remittance family gets discount zeroed and the full amount paid
    if kind == "remit":
        if fam == "remit_shortpay":
            if not g["discount_pct"]:
                g["discount_pct"] = rng.choice([5, 10, 15])
                total = sum(i["amount_cents"] for i in g["applications"])
                g["discount_cents"] = int(total * g["discount_pct"] / 100)
                g["amount_cents"] = total - g["discount_cents"]
            g["applications"] = g["applications"][:1]  # template renders one invoice
            total = g["applications"][0]["amount_cents"]
            g["discount_cents"] = int(total * g["discount_pct"] / 100)
            g["amount_cents"] = total - g["discount_cents"]
        elif g["discount_pct"]:
            g["discount_pct"] = 0; g["discount_cents"] = 0
            g["amount_cents"] = sum(i["amount_cents"] for i in g["applications"])
    doc = render(g)
    h = hashlib.md5(doc.encode()).hexdigest()
    if h in seen: continue
    seen.add(h)
    s = split_of(g, fam)
    ent = g.get("payer") or g.get("vendor")
    buckets[s].append(json.dumps({
        "messages": [
            {"role": "user", "content": "Extract every field from this finance document as JSON. Amounts are integer cents. Respond with JSON only.\n\n" + doc},
            {"role": "assistant", "content": label_of(g)}],
        "meta": {"family": fam, "doc_kind": g["doc_kind"], "entity": ent, "month": g["month"],
                 "held_out_party": ent in HELD_CUST or ent in HELD_VEND, "test_only_family": fam in TEST_ONLY_FAMILIES}}))
for s, rows in buckets.items():
    Path(out / f"sft.{s}.jsonl").write_text("\n".join(rows) + "\n")

# ---------------------------------------------------------------- head (b): matching pairs
pair_rows = [["bank_txn_id", "invoice_id", "label", "amount_delta_cents", "date_delta_days", "name_sim", "ref_hit", "n_candidates"]]
def name_sim(a_, b_):
    A = set(a_.lower().split()); B = set(b_.lower().split())
    return round(len(A & B) / max(len(A | B), 1), 3)
for t in range(600):
    payer = rng.choice(CUSTOMERS); month = rng.choice(MONTHS)
    true_inv = {"id": inv_no(), "party": payer, "amount": cents(), "day": rng.randint(1, 28)}
    # distractors drawn to be genuinely confusable: same payer other invoices, similar amounts, same-day others
    cands = [true_inv]
    for _ in range(rng.randint(3, 9)):
        style = rng.random()
        if style < 0.35: c = {"id": inv_no(), "party": payer, "amount": cents(), "day": rng.randint(1, 28)}
        elif style < 0.7: c = {"id": inv_no(), "party": rng.choice(CUSTOMERS), "amount": true_inv["amount"] + rng.choice([-100, 0, 100, 1240]), "day": rng.randint(1, 28)}
        else: c = {"id": inv_no(), "party": rng.choice(CUSTOMERS), "amount": cents(), "day": true_inv["day"]}
        cands.append(c)
    rng.shuffle(cands)
    short = rng.random() < 0.15
    paid = true_inv["amount"] - (int(true_inv["amount"] * 0.1) if short else 0)
    desc = rng.choice([f"ACH {payer.upper()} {true_inv['id']}", f"WIRE {payer.upper()[:12]}",
                       f"{payer.split()[0].upper()} PYMT", f"INCOMING {rng.randint(10**8, 10**9)}"])
    txn_id = f"BT-{t:05d}"
    for c in cands:
        pair_rows.append([txn_id, c["id"], int(c is true_inv), abs(paid - c["amount"]),
                          abs(true_inv["day"] - c["day"]), name_sim(desc, c["party"]),
                          int(c["id"] in desc), len(cands)])
with open(out / "pairs.csv", "w", newline="") as f: csv.writer(f).writerows(pair_rows)

# ---------------------------------------------------------------- head (d): GL coding
code_rows = {"train": [["vendor", "memo", "amount_cents", "account"]], "test": [["vendor", "memo", "amount_cents", "account"]]}
MEMOS = ["monthly subscription", "usage charges", "annual renewal", "invoice {}", "services {}", "auto-pay", ""]
for _ in range(1200):
    v = rng.choice(VENDORS)
    row = [v, rng.choice(MEMOS).format(f"B-{rng.randint(1000,9999)}"), cents(20_00, 60_000_00), ACCOUNTS[v]]
    code_rows["test" if v in HELD_VEND or rng.random() < 0.15 else "train"].append(row)
for s, rows in code_rows.items():
    with open(out / f"coding.{s}.csv", "w", newline="") as f: csv.writer(f).writerows(rows)

manifest = {
    "generator": "ft/gen_data.py", "seed": a.seed,
    "sft_counts": {s: len(b) for s, b in buckets.items()},
    "pairs_txns": 600, "coding_rows": {s: len(r) - 1 for s, r in code_rows.items()},
    "held_out_customers": sorted(HELD_CUST), "held_out_vendors": sorted(HELD_VEND),
    "test_only_families": sorted(TEST_ONLY_FAMILIES),
    "honesty_note": "synthetic; test = held-out entities + never-seen template families + July",
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps({k: manifest[k] for k in ("sft_counts", "pairs_txns", "coding_rows")}, indent=1))
