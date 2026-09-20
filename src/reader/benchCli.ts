import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flagInt, flagString, out, parseArgs, runCli, warn } from "../cli/flags.js";
import { loadBenchDocs, runReaderBench, type BenchDoc, type ReaderBenchResult } from "./bench.js";
import { openAICompatReader } from "./openaiCompat.js";
import type { DocumentReader } from "./types.js";

const USAGE = "usage: pnpm bench:reader [--n 100] [--family remit_ocr] [--docs ft/data/sft.test.jsonl] (--oracle | --saboteur | --none | --reader-url U --reader-model M [--reader-name N])";

/**
 * What a document reader is worth to the harness, measured on lane C's held-out remittances: the real worker runs
 * over a ledger rebuilt from them, and every posting is checked against what the customer wrote. `--oracle` reads
 * perfectly (the ceiling our own verification allows); `--none` is the harness with no reader (the floor).
 */
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2), ["oracle", "none", "saboteur"]);
  const path = flagString(args, "docs") ?? "ft/data/sft.test.jsonl";
  if (!existsSync(path)) { warn(`no documents at ${path}\n${USAGE}`); return 1; }
  const docs = loadBenchDocs(path, flagInt(args, "n") ?? 100, flagString(args, "family"));
  const reader = pickReader(args, docs);
  if (reader === null) { warn(USAGE); return 1; }
  const result = await runReaderBench(docs, reader);
  print(result);
  mkdirSync(join("runs", "reader-bench"), { recursive: true });
  const file = join("runs", "reader-bench", `${result.reader.replace(/[^A-Za-z0-9._-]+/g, "_")}-n${result.n}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  out(`saved ${file}`);
  return result.wrong_postings === 0 ? 0 : 2;
}

function pickReader(args: ReturnType<typeof parseArgs>, docs: BenchDoc[]): DocumentReader | undefined | null {
  if (args.flags.none === true) return undefined;
  if (args.flags.oracle === true) {
    // The worker hands the reader the whole mail (subject and body), so the document is found by its payment reference.
    const find = (mail: string): unknown => docs.find((d) => d.gold.ref !== undefined && mail.includes(d.gold.ref))?.gold ?? {};
    return { name: "oracle (gold labels, not a model)", read: (mail) => Promise.resolve({ ok: true, doc: find(mail), latency_ms: 0 }) };
  }
  if (args.flags.saboteur === true) return saboteur(docs);
  const [url, model] = [flagString(args, "reader-url"), flagString(args, "reader-model")];
  return url && model ? openAICompatReader({ base_url: url, model, name: flagString(args, "reader-name") ?? model }) : null;
}

/**
 * A reader that is wrong on purpose, in the ways that would do damage: amounts swapped between invoices, an invoice
 * replaced by another open invoice of the same customer, a total that still foots. Every one must be refused.
 */
function saboteur(docs: BenchDoc[]): DocumentReader {
  return {
    name: "saboteur (deliberately wrong, not a model)",
    read: (mail) => {
      const i = docs.findIndex((d) => d.gold.ref !== undefined && mail.includes(d.gold.ref));
      const gold = docs[i]?.gold;
      if (!gold) return Promise.resolve({ ok: true, doc: {}, latency_ms: 0 });
      const apps = gold.applications.map((a) => ({ ...a }));
      if (apps.length > 1 && i % 2 === 0) [apps[0]!.amount_cents, apps[1]!.amount_cents] = [apps[1]!.amount_cents, apps[0]!.amount_cents];
      else apps[0]!.invoice = `DECOY-${i}-1`;
      return Promise.resolve({ ok: true, doc: { ...gold, applications: apps }, latency_ms: 0 });
    },
  };
}

function print(r: ReaderBenchResult): void {
  out(`\nreader: ${r.reader} · ${r.n} held-out remittances, one receipt each, invoices not named on the bank line`);
  out(`  settled from code, as the customer directed   ${r.settled_from_code}`);
  out(`  cash applied, claimed deduction left open     ${r.applied_deduction_open}`);
  out(`  left for a stronger tier or a person          ${r.left_for_judgment}`);
  out(`  WRONG POSTINGS                                ${r.wrong_postings}${r.wrong_postings === 0 ? "" : "   <-- must be zero"}`);
  out(`  books tied ${r.books_tied ? "yes" : "NO"} · average read ${r.avg_latency_ms} ms`);
  for (const [fam, f] of Object.entries(r.by_family)) out(`    ${fam.padEnd(16)} ${f.settled}/${f.n} settled`);
  for (const [why, n] of Object.entries(r.refusal_reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)) out(`    refused ${n}×: ${why}`);
}

runCli(main);
