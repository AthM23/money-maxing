/**
 * Lane C — export training data from the trace store (brief: architecture-briefs/fine-tuning.md, stages 1-3).
 * Written against src/contract/schema.sql (commit 06faa4c). Runs once the runtime has produced decisions.
 *
 *   pnpm tsx ft/export.ts --db data/footnote.db --out ft/data
 *
 * Emits:
 *   ft/data/sft.{train,cal,test}.jsonl   — task (e): docs+intent → accepted proposal JSON (chat format)
 *   ft/data/pairs.csv                    — task (b): bank line × invoice candidate pair features for the GBT
 *   ft/data/manifest.json                — counts, split boundaries, held-out entities
 *
 * Filters (rejection sampling, kernel as verifier):
 *   keep decisions with workpaper.kernel_verdict='accept'
 *   drop decisions with an approval outcome='corrected' (the human version is gold; agent original goes to
 *   dpo_rejected.jsonl for later DPO — not used for SFT)
 * Split BY TIME (train Apr-May, calibrate Jun, test Jul) and hold out whole parties so names can't be memorized.
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const db = new Database(arg("db", "data/footnote.db"), { readonly: true });
const outDir = arg("out", "ft/data");
mkdirSync(outDir, { recursive: true });

// Held-out parties: deterministic pick of ~15% by hashed id, so reruns agree without a seed file.
const parties = db.prepare(`SELECT id FROM party ORDER BY id`).all() as { id: string }[];
const holdout = new Set(parties.filter((p) => hash(p.id) % 7 === 0).map((p) => p.id));

const rows = db
  .prepare(
    `SELECT d.id, d.kind, d.function, d.proposal_json, d.created_at, dp.period,
            i.question, w.kernel_verdict
       FROM decision d
       JOIN workpaper w ON w.decision_id = d.id AND w.kernel_verdict = 'accept'
       JOIN intent i ON i.id = d.intent_id
       LEFT JOIN decision_point dp ON dp.id = d.decision_point_id
      WHERE d.proposal_json IS NOT NULL
        AND d.id NOT IN (SELECT decision_id FROM approval WHERE outcome = 'corrected')`
  )
  .all() as any[];

const evidenceDocs = db.prepare(
  `SELECT payload_json, kind FROM trace WHERE id = ?`
);

type Split = "train" | "cal" | "test";
const splitOf = (r: any): Split => {
  const period: string = r.period ?? r.created_at?.slice(0, 7) ?? "2026-07";
  if (period <= "2026-05") return "train";
  if (period === "2026-06") return "cal";
  return "test";
};

const buckets: Record<Split, string[]> = { train: [], cal: [], test: [] };
let skippedHoldout = 0;
for (const r of rows) {
  const proposal = JSON.parse(r.proposal_json);
  // input = the docs the decision cited, verbatim, plus the intent question
  const docs = (proposal.evidence ?? [])
    .map((e: any) => {
      const t = evidenceDocs.get(e.trace_id) as any;
      return t ? `--- ${t.kind} ---\n${t.payload_json}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
  if (!docs) continue;
  const split = splitOf(r);
  // held-out parties: excluded from train/cal, reported separately inside test via manifest
  if (split !== "test" && holdout.has(proposal.party_id)) { skippedHoldout++; continue; }
  buckets[split].push(
    JSON.stringify({
      messages: [
        { role: "user", content: `${r.question}\nFunction: ${r.function}. Respond with the proposal JSON only.\n\n${docs}` },
        { role: "assistant", content: r.proposal_json },
      ],
      meta: { decision_id: r.id, kind: r.kind, party_id: proposal.party_id, split, held_out_party: holdout.has(proposal.party_id) },
    })
  );
}

// Task (b): pair features for the GBT — every accepted apply_payment against the REAL open-candidate set.
const pairRows: string[] = ["bank_txn_id,invoice_id,label,amount_delta_cents,date_delta_days,name_sim,ref_hit,n_candidates"];
const applied = db
  .prepare(
    `SELECT d.proposal_json, d.created_at FROM decision d
       JOIN workpaper w ON w.decision_id = d.id AND w.kernel_verdict='accept'
      WHERE d.kind = 'apply_payment'`
  )
  .all() as any[];
const openInvoices = db.prepare(
  `SELECT id, party_id, total_cents, issue_date FROM invoice WHERE issue_date <= ?`
);
const bankTxn = db.prepare(`SELECT * FROM bank_txn WHERE id = ?`);
for (const a of applied) {
  const p = JSON.parse(a.proposal_json);
  const chosen = new Set((p.applications ?? []).map((x: any) => x.doc_id));
  const bt = p.bank_txn_id ? (bankTxn.get(p.bank_txn_id) as any) : null;
  if (!bt) continue;
  const cands = openInvoices.all(a.created_at.slice(0, 10)) as any[];
  for (const c of cands) {
    pairRows.push(
      [bt.id, c.id, chosen.has(c.id) ? 1 : 0,
       Math.abs(bt.amount_cents - c.total_cents),
       Math.round((Date.parse(bt.posted_date ?? a.created_at) - Date.parse(c.issue_date)) / 86400000),
       nameSim(bt.descriptor ?? "", c.party_id ?? ""), (bt.descriptor ?? "").includes(c.id) ? 1 : 0,
       cands.length].join(",")
    );
  }
}

for (const s of ["train", "cal", "test"] as Split[])
  writeFileSync(`${outDir}/sft.${s}.jsonl`, buckets[s].join("\n") + "\n");
writeFileSync(`${outDir}/pairs.csv`, pairRows.join("\n") + "\n");
writeFileSync(
  `${outDir}/manifest.json`,
  JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      counts: { train: buckets.train.length, cal: buckets.cal.length, test: buckets.test.length, pairs: pairRows.length - 1 },
      skipped_holdout_in_train: skippedHoldout,
      holdout_parties: [...holdout],
      split_rule: "period <= 2026-05 train, 2026-06 cal, else test",
    },
    null, 2
  )
);
console.log(`exported: train=${buckets.train.length} cal=${buckets.cal.length} test=${buckets.test.length} pairs=${pairRows.length - 1} (holdout parties: ${holdout.size})`);

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function nameSim(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const t of A) if (B.has(t)) hit++;
  return +(hit / Math.max(A.size, B.size)).toFixed(3);
}
