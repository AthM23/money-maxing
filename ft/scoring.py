"""Dependency-free benchmark grading and calibration. No model calls or CLI side effects."""
import datetime
import json

SCORER_VERSION = "strict-v2"


def canon(text):
    if not isinstance(text, str):
        return None
    text = text.strip()
    if text.startswith("```json\n") and text.endswith("```"):
        text = text[8:-3].strip()
    elif text.startswith("```\n") and text.endswith("```"):
        text = text[4:-3].strip()
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else None
    except (ValueError, TypeError):
        return None


def schema_matches(value, template, key=""):
    if type(value) is not type(template):
        return False  # bool is not an integer amount
    if isinstance(template, dict):
        return value.keys() == template.keys() and all(schema_matches(value[k], v, k) for k, v in template.items())
    if isinstance(template, list):
        return not value or bool(template) and all(schema_matches(v, template[0]) for v in value)
    if key == "doc_kind":
        return value == template
    if key == "date":
        try:
            return datetime.date.fromisoformat(value).isoformat() == value
        except ValueError:
            return False
    if key == "method":
        return value in ("ACH", "wire", "check")
    if key.endswith("_cents") or key == "terms_days":
        return 0 <= value <= 2**53 - 1
    if key.endswith("_pct"):
        return 0 <= value <= 100
    return True


def flat(value, prefix=""):
    # Container lengths distinguish absent/empty arrays and additional empty objects.
    if isinstance(value, dict):
        out = {prefix + "#keys": ("keys", tuple(sorted(value)))}
        for key, child in value.items():
            out.update(flat(child, prefix + key + "."))
        return out
    if isinstance(value, list):
        out = {prefix + "#length": ("length", len(value))}
        for i, child in enumerate(value):
            out.update(flat(child, f"{prefix}[{i}]."))
        return out
    return {prefix: (type(value).__name__, value)}


def score(pred_text, gold_text):
    pred, gold = canon(pred_text), json.loads(gold_text)
    if pred is None:
        return {"schema_valid": 0, "exact": 0, "field_f1": 0.0}
    fp, fg = flat(pred), flat(gold)
    hit = sum(key in fp and fp[key] == value for key, value in fg.items())
    f1 = 2 * hit / max(len(fp) + len(fg), 1)
    valid = schema_matches(pred, gold)
    return {"schema_valid": int(valid), "exact": int(valid and fp == fg), "field_f1": round(f1, 4)}


def choose_threshold(calibration_scores, target=0.99):
    """Freeze a threshold from calibration only. No qualifying group means abstain."""
    threshold = 1.01
    for t in sorted({s for s, _ in calibration_scores}, reverse=True):
        selected = [correct for s, correct in calibration_scores if s >= t]
        if selected and sum(selected) / len(selected) >= target:
            threshold = t
    return threshold
