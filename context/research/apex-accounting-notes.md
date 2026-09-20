# APEX-Accounting (Mercor × Ramp) — dev set downloaded, how we use it

Downloaded to `../apex-accounting/` (sibling of this repo; 4 MB, CC BY 4.0, training/eval use explicitly
permitted). HF: `mercor/apex-accounting`. 10 dev tasks, one world: Sterling, Marsh & Associates LLP,
a Philadelphia law firm at Dec-2024 close. 90 expert-authored world files (xlsx/csv/pdf), binary rubrics,
gold outputs. The scored 160-task benchmark is closed; dev numbers must never be reported as APEX scores.

## Published leaderboard (held-out n=160) — the "frontier isn't solved" slide

Claude-Fable-5 56.4% · Muse-Spark-1.1 52.6% · GPT-5.6-Sol 51.5% · Opus-4.8 48.0% ·
Gemini-3.1-Pro 32.4% · **Qwen3.5-397B 24.4%**. Real accounting work, half the rubric criteria failed
by the best frontier model. Pairs with AccountingBench's drift chart (see accountingbench-penrose.md).

## What it is and is not for us

- **NOT SFT data for lane C's extraction model**: 10 multi-hour agent tasks ≠ a training corpus, and the
  right consumer of the *tasks* is the harness (lane A), not the small model.
- **External generalization probe (measured 2026-09-20 ~01:00):** fed the world's contract-attorney
  invoice PDF (`Avila_AVILA-202403-A1.pdf`, pdftotext) to our live fine-tuned endpoint. Output: every
  field correct — amount 350000 cents, date 2024-03-20, vendor/payer, ref, net-30 — doc_kind
  vendor_bill. Flaws, reported: one duplicate key + one invented null field (parseable, not strict);
  latency 15.3 s under concurrent benchmark load. This is a document authored by practicing accountants
  in a layout our generator never produced.
- **Template mining**: their document styles (hours×rate invoice tables, registers, IOLTA statements)
  are candidates for new generator families if we expand data.
- **Harness eval anchor (lane A's call)**: running 1-2 dev tasks through Footnote's loop would give an
  external reference point; 500-step/5M-token limits per their harness. Dev world is the easiest of 11 —
  say so if quoted.
