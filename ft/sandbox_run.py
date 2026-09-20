# Lane C — external benchmark run: ciru-ai Invoice Sandbox Benchmark (cited in the Maximor track doc).
# Division of labor mirrors the product architecture: the FINE-TUNED MODEL reads each PDF's text and
# extracts amounts/parties/refs; DETERMINISTIC CODE classifies traps (voids, statements, duplicates,
# supersedes) from literal text flags and does all arithmetic. Models never add numbers.
#
#   python3 ft/sandbox_run.py --sandbox ../invoice-sandbox-benchmark --endpoint http://100.73.102.120:8000
#
# Writes submission.csv + a per-doc audit JSON, then invokes the benchmark's own scorer.
import argparse, csv, json, re, subprocess, time, urllib.request
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from pypdf import PdfReader

ap = argparse.ArgumentParser()
ap.add_argument("--sandbox", default="../invoice-sandbox-benchmark")
ap.add_argument("--endpoint", default="http://100.73.102.120:8000")
ap.add_argument("--out", default="ft/data/sandbox")
a = ap.parse_args()
sb = Path(a.sandbox); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

def model_extract(text):
    body = json.dumps({"max_tokens": 1200, "messages": [{"role": "user", "content":
        "Extract every field from this finance document as JSON. Amounts are integer cents. Respond with JSON only.\n\n" + text[:3500]}]}).encode()
    req = urllib.request.Request(a.endpoint + "/v1/chat/completions", data=body, headers={"Content-Type": "application/json"})
    try:
        j = json.loads(urllib.request.urlopen(req, timeout=240).read())
    except Exception:
        return None, None
    raw = j["choices"][0]["message"]["content"] or ""
    raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        if "{" in raw and "}" in raw: raw = raw[raw.index("{"): raw.rindex("}") + 1]
        return json.loads(raw), j["usage"].get("latency_ms")
    except Exception:
        return None, j["usage"].get("latency_ms")

docs = []
pdfs = sorted((sb / "gold_master/invoices").glob("*.pdf"))
print(f"{len(pdfs)} PDFs")
for i, f in enumerate(pdfs):
    text = "\n".join(p.extract_text() for p in PdfReader(f).pages)
    up = text.upper()
    # deterministic classification from literal flags in the document
    kind = ("credit_memo" if "CREDIT MEMO" in up else
            "statement" if "STATEMENT" in up and "INVOICE " not in up.split("\n")[2].upper() else "invoice")
    void = bool(re.search(r"\bVOID", up))
    doc_no_m = re.search(r"\b((?:INV|CM)-\d{4}-\d+)", text)
    cust_m = re.search(r"Customer ID\s*\n?\s*(C\d+)", text)
    name_m = re.search(r"Customer\s*\n?\s*([A-Z][A-Za-z &']+)\s*\n\s*Customer ID", text)
    revised = bool(re.search(r"\bR\d\b|REVISED|SUPERSEDE", up) or "_R1_" in f.name or "revised" in f.name)
    extraction, lat = model_extract(text)
    amount = None
    if extraction and isinstance(extraction.get("amount_cents"), int):
        amount = Decimal(extraction["amount_cents"]) / 100
    docs.append({"file": f.name, "doc_no": doc_no_m.group(1) if doc_no_m else f.stem,
                 "customer": cust_m.group(1) if cust_m else (extraction or {}).get("party_id", "?"),
                 "name": name_m.group(1).strip() if name_m else (extraction or {}).get("payer", ""),
                 "kind": kind, "void": void, "revised": revised,
                 "model_amount_usd": str(amount) if amount is not None else None,
                 "model_parse_ok": extraction is not None, "latency_ms": lat})
    print(f"[{i+1}/{len(pdfs)}] {f.name}: {kind}{' VOID' if void else ''}{' REV' if revised else ''} amount={amount}")

# dedup by doc number: revised beats original, else first seen
by_no = {}
for d in docs:
    cur = by_no.get(d["doc_no"])
    if cur is None or (d["revised"] and not cur["revised"]):
        by_no[d["doc_no"]] = d

totals = defaultdict(lambda: {"n": 0, "gross": Decimal(0), "credit": Decimal(0), "name": ""})
for d in by_no.values():
    if d["void"] or d["kind"] == "statement" or d["model_amount_usd"] is None: continue
    t = totals[d["customer"]]; t["name"] = t["name"] or d["name"]
    amt = Decimal(d["model_amount_usd"])
    if d["kind"] == "credit_memo": t["credit"] += abs(amt)
    else: t["gross"] += amt; t["n"] += 1

sub = out / "submission.csv"
with open(sub, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["customer_id", "customer_name", "valid_invoice_count", "gross_invoice_spend_usd", "credit_memo_total_usd", "net_spend_usd"])
    for cid in sorted(totals):
        t = totals[cid]
        w.writerow([cid, t["name"], t["n"], f"{t['gross']:.2f}", f"{t['credit']:.2f}", f"{t['gross'] - t['credit']:.2f}"])
(out / "audit.json").write_text(json.dumps(docs, indent=1))
print("\nSubmission written; scoring with THEIR scorer:")
r = subprocess.run(["python3", str(sb / "scripts/score_submission.py"), str(sub)], capture_output=True, text=True)
print(r.stdout[-2000:] or r.stderr[-2000:])
(out / "score_output.txt").write_text(r.stdout + r.stderr)
