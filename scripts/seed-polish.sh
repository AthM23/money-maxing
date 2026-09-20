#!/usr/bin/env bash
# Two more derived policies and two remembered facts, so Policies & memory shows a lived-in company.
# Everything is consistent with the seeded July: Meridian's short is exactly 10% withholding, Halvorsen's
# $1,200 dispute matches its short receipt, the FX policy names what the code tier already does.
set -e
cd "$(dirname "$0")/.."
for db in runs/demo/prepared.db runs/demo/start.db runs/demo/fresh.db runs/demo/live.db runs/demo/nothing.db; do
  [ -f "$db" ] || continue
  sqlite3 "$db" <<'SQL'
INSERT OR IGNORE INTO policy (id, function, name, condition_json, action_json, intent_text, tier, max_amount_cents, backtest_json, status, approved_by, approved_at, code, version)
VALUES
('pol_seed_fx01','ar','FX-SETTLE-01 v1 · realized FX on settled EUR wires → 7100, recomputed from the advice',
 '{"all":[{"field":"kind","op":"==","value":"realized_fx"},{"field":"currency","op":"in","value":["EUR","GBP"]}]}',
 '{"kind":"reclass","account":"7100"}',
 'Booked identically on every settled foreign wire last quarter (6 of 6).',
 'company',10000000,'{"n":6,"agree":6,"account_outliers":[],"regressions":[],"held_out_n":5,"held_out_covered":5}',
 'approved','U_CTRL','2026-09-19T21:14:00.000Z','FX-SETTLE-01',1),
('pol_seed_disc01','ar','DISC-EARLY-01 v1 · early-pay discount ≤ 2% inside terms → 4900 concessions',
 '{"all":[{"field":"discount_pct","op":">","value":0},{"field":"discount_pct","op":"<=","value":2},{"field":"within_terms","op":"==","value":true}]}',
 '{"kind":"concession","account":"4900"}',
 'Drafted from 4 matching bookings; awaiting a controller, like a pull request.',
 'company',500000,'{"n":4,"agree":4,"account_outliers":[],"regressions":[],"held_out_n":3,"held_out_covered":3}',
 'proposed',NULL,NULL,'DISC-EARLY-01',1);
INSERT OR IGNORE INTO fact (id, party_id, predicate, value_json, scope_json, explained_amount_cents, max_amount_cents, uses, valid_from, valid_to, learned_at, source_trace_ids_json, stated_by, approved_by, status)
VALUES
('fact_seed_meridian_wht','meridian','withholds_tax_at_source',
 '{"pct":10,"treatment":"tax_withholding","certificate":"expected by mail"}',
 '{"applies_to":"cross-border remittances from Meridian Infotech"}',
 180000,10000000,'standing','2026-07-01','2026-12-31','2026-07-18T15:40:00.000Z','[]','U_CFO','U_CTRL','active'),
('fact_seed_halvorsen_dispute','halvorsen','holds_amount_in_dispute',
 '{"amount_cents":120000,"treatment":"dispute_hold","reason":"delivery damage claim, their ticket HF-2214"}',
 '{"applies_to":"INV-3141 only"}',
 120000,10000000,'one_time','2026-07-20','2026-10-31','2026-07-20T10:05:00.000Z','[]','U_SAM','U_CTRL','active');
SQL
done
echo "policies and memory seeded"
