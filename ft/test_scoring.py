import json
import unittest
import pathlib
import subprocess
import sys
import tempfile
from scoring import canon, choose_threshold, score


class ScoringTests(unittest.TestCase):
    gold = {"doc_kind": "vendor_bill", "vendor": "Acme", "date": "2026-07-01", "amount_cents": 100, "period": "July", "terms_days": 30, "ref": "B-1"}

    def test_malformed_responses_do_not_crash(self):
        for text in (None, "{", "[]", "null", "42", "not JSON"):
            self.assertIsNone(canon(text))
            self.assertEqual(score(text, json.dumps(self.gold))["schema_valid"], 0)

    def test_types_keys_and_calendar_are_real_schema_checks(self):
        for change in ({"amount_cents": True}, {"amount_cents": "100"}, {"amount_cents": -1}, {"date": "2026-02-31"}, {"extra": {}}):
            result = score(json.dumps({**self.gold, **change}), json.dumps(self.gold))
            self.assertEqual(result["schema_valid"], 0)
            self.assertEqual(result["exact"], 0)
        self.assertEqual(score(json.dumps(self.gold), json.dumps(self.gold))["exact"], 1)

    def test_threshold_uses_only_calibration_and_can_abstain(self):
        self.assertEqual(choose_threshold([(0.8, True), (0.7, False)]), 0.8)
        self.assertEqual(choose_threshold([(0.9, False)]), 1.01)
        self.assertEqual(choose_threshold([]), 1.01)

    def test_output_refuses_to_merge_different_prompt_conditions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)
            row = {"messages": [{"role": "user", "content": "Extract as JSON."}, {"role": "assistant", "content": json.dumps(self.gold)}], "meta": {"family": "bill"}}
            (path / "sft.test.jsonl").write_text(json.dumps(row) + "\n")
            command = [sys.executable, str(pathlib.Path(__file__).with_name("benchmark.py")), "--data", directory]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            saved = (path / "benchmark_results_v2.json").read_text()
            second = subprocess.run(command + ["--hint"], capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertIn("different dataset, prompt condition, or scorer", second.stderr)
            self.assertEqual((path / "benchmark_results_v2.json").read_text(), saved)


if __name__ == "__main__":
    unittest.main()
