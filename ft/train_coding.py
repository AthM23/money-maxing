# Lane C — head (d) GL account coding baseline: vendor + memo + amount → account. CPU, seconds.
#   python3 ft/train_coding.py --data ft/data
# Held-out vendors are in the test file only, so accuracy splits into seen-vendor vs unseen-vendor:
# unseen-vendor coding is expected to be poor for a lookup-ish model — that is the honest point the
# demo makes about when to abstain and escalate.
import argparse, csv, json
from pathlib import Path
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, FunctionTransformer

ap = argparse.ArgumentParser(); ap.add_argument("--data", default="ft/data"); a = ap.parse_args()
def load(split):
    rows = list(csv.DictReader(open(f"{a.data}/coding.{split}.csv")))
    X = [{"vendor": r["vendor"], "memo": r["memo"], "amount": float(r["amount_cents"])} for r in rows]
    return X, [r["account"] for r in rows], rows
Xtr, ytr, _ = load("train"); Xte, yte, te_rows = load("test")
train_vendors = {x["vendor"] for x in Xtr}

pipe = Pipeline([
    ("feats", ColumnTransformer([
        ("vendor", OneHotEncoder(handle_unknown="ignore"), ["vendor"]),
        ("memo", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), max_features=2000), "memo"),
    ], remainder="drop")),
    ("dense", FunctionTransformer(lambda x: x.toarray(), accept_sparse=True)),
    ("clf", HistGradientBoostingClassifier(max_iter=150)),
])
import pandas as pd
pipe.fit(pd.DataFrame(Xtr), ytr)
pred = pipe.predict(pd.DataFrame(Xte))
seen = [i for i, x in enumerate(Xte) if x["vendor"] in train_vendors]
unseen = [i for i, x in enumerate(Xte) if x["vendor"] not in train_vendors]
acc = lambda idx: round(sum(pred[i] == yte[i] for i in idx) / max(len(idx), 1), 3)
report = {"n_test": len(yte), "acc_all": acc(range(len(yte))),
          "acc_seen_vendor": acc(seen), "n_seen": len(seen),
          "acc_unseen_vendor": acc(unseen), "n_unseen": len(unseen)}
Path(f"{a.data}/coding_report.json").write_text(json.dumps(report, indent=2))
print("CODING", json.dumps(report))
