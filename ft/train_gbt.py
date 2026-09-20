# Lane C — GBT pair-feature baseline for task (b) bank-line → invoice matching. PRIMARY per the brief;
# CPU, seconds, runs anywhere (Mac or GX10):  python ft/train_gbt.py --pairs ft/data/pairs.csv
# Reports: top-1 per bank line, recall@3, precision at the auto-clear threshold (target >= 99%).
import argparse, csv, json, hashlib
from collections import defaultdict
from pathlib import Path
from scoring import choose_threshold
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression

ap = argparse.ArgumentParser()
ap.add_argument("--pairs", default="ft/data/pairs.csv")
ap.add_argument("--out", default="ft/data/gbt_report.json")
a = ap.parse_args()

rows = list(csv.DictReader(open(a.pairs)))
assert rows, "pairs.csv is empty — run export.ts first"
FEATS = ["amount_delta_cents", "date_delta_days", "name_sim", "ref_hit", "n_candidates"]

def bucket(txn_id):  # deterministic 70/15/15 by bank txn, so a txn's candidates never straddle splits
    h = int(hashlib.md5(txn_id.encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else ("cal" if h < 85 else "test")

by_split = defaultdict(lambda: defaultdict(list))
for r in rows:
    by_split[bucket(r["bank_txn_id"])][r["bank_txn_id"]].append(r)

def xy(split):
    X, y = [], []
    for cands in by_split[split].values():
        for r in cands:
            X.append([float(r[f]) for f in FEATS]); y.append(int(r["label"]))
    return X, y

Xtr, ytr = xy("train")
clf = HistGradientBoostingClassifier(max_iter=200, random_state=7).fit(Xtr, ytr)
Xc, yc = xy("cal")
iso = IsotonicRegression(out_of_bounds="clip").fit(clf.predict_proba(Xc)[:, 1], yc) if Xc else None

def rank_eval(split):
    top1 = r3 = n = 0
    scored = []  # (calibrated top score, correct?) per txn, for the auto-clear threshold
    for cands in by_split[split].values():
        probs = clf.predict_proba([[float(r[f]) for f in FEATS] for r in cands])[:, 1]
        if iso is not None: probs = iso.predict(probs)
        order = sorted(range(len(cands)), key=lambda i: -probs[i])
        correct = int(cands[order[0]]["label"]) == 1
        top1 += correct; r3 += any(int(cands[i]["label"]) for i in order[:3]); n += 1
        scored.append((float(probs[order[0]]), correct))
    return top1, r3, n, scored

# The test labels NEVER select the operating threshold. No-match transactions count as errors if selected.
_, _, n_cal, calibration_scores = rank_eval("cal")
thr = choose_threshold(calibration_scores)
top1, r3, n, scored = rank_eval("test")
selected = [correct for confidence, correct in scored if confidence >= thr]
report = {"n_test_txns": n, "top1": round(top1 / max(n, 1), 3), "recall_at_3": round(r3 / max(n, 1), 3),
          "auto_clear_threshold": None if thr > 1 else thr, "threshold_source": "calibration", "n_cal_txns": n_cal,
          "test_auto_clear_coverage": round(len(selected) / max(n, 1), 3),
          "test_auto_clear_precision": round(sum(selected) / len(selected), 3) if selected else None,
          "test_false_auto_clears": sum(not correct for correct in selected), "n_train_pairs": len(Xtr)}
Path(a.out).write_text(json.dumps(report, indent=2))
print("GBT", json.dumps(report))
