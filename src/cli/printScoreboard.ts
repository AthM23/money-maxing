import type { RunDelta, Scoreboard } from "../learn/scoreboard.js";
import { out } from "./flags.js";

const dollars = (micros: number): string => `$${(micros / 1_000_000).toFixed(4)}`;
const pct = (num: number, den: number): string => (den === 0 ? "n/a" : `${((100 * num) / den).toFixed(1)}%`);

export function printScoreboard(title: string, s: Scoreboard): void {
  out(`\n${title}`);
  out(`  cases ${s.intents} · resolved ${s.resolved} · waiting on a person ${s.waiting_on_human}`);
  out(`  decisions ${s.decisions} · reached by code ${s.decided_by_code} · by a model ${s.decided_by_model} · posted with no person ${s.auto_posted} · parked ${s.parked} · blocked ${s.blocked}`);
  out(`  routes ${Object.entries(s.by_route).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  out(`  model calls ${s.model_calls} · cost ${dollars(s.cost_micros)} · questions ${s.questions} (repeat ${s.repeat_questions})`);
  out(`  approvals: people ${s.human_approvals} · controller agent ${s.controller_approvals} · independent reviews ${s.controller_reviews} (${s.controller_tokens} tokens, not in the cost above)`);
  if (s.documents_read > 0) out(`  documents read by a small model ${s.documents_read} · readings code could verify and used ${s.readings_used}`);
  out(`  tick marks re-performed in code ${s.checkable_num} / ${s.checkable_den} (${pct(s.checkable_num, s.checkable_den)})`);
}

export function printComparison(deltas: RunDelta[]): void {
  out("\nsame month, only memory changed        run 1      run 2");
  for (const d of deltas) {
    const fmt = (n: number): string => (d.metric === "cost_micros" ? dollars(n) : String(n)).padStart(10);
    out(`  ${d.metric.padEnd(34)}${fmt(d.run1)} ${fmt(d.run2)}`);
  }
}
