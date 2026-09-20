import type { KernelResult, KernelVerdict } from "../contract/types.js";
import { runKernel } from "../kernel/index.js";
import { APP_CONFIG } from "../packs/index.js";
import type { RuntimeConfig } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { approvalOnFile, evidenceIntegrity, ledgerTieOut } from "./rerunChecks.js";
import { buildRerunContext } from "./rerunContext.js";
import { finding } from "./shared.js";
import { loadSubject, type RerunSubject } from "./subject.js";
import type { Finding, RerunResult } from "./types.js";

/**
 * Independent re-performance of one posted decision: run the same deterministic kernel over the same
 * proposal, against the world as it stood before the entry posted (see `rerunContext`), then check in
 * code the three things the kernel cannot see afterwards — that the ledger still says what was
 * proposed, that the evidence still says what was quoted, and that the approval still holds.
 *
 * The configuration defaults to the application's own, so a function's pack checks are re-performed
 * rather than reported missing: the auditor runs the same kernel the entry posted through, not a
 * weaker one that fails everything it cannot see.
 */
export function rerunDecision(db: Db, decisionId: string, config: RuntimeConfig = APP_CONFIG): RerunResult {
  const subject = loadSubject(db, decisionId);
  if (!subject) return unreadable(db, decisionId);
  const { ctx, neutralised } = buildRerunContext(db, subject, config);
  const fresh = runKernel(subject.proposal, ctx, "post_gate");
  const stored = storedVerdict(db, decisionId);
  return {
    decision_id: decisionId,
    fresh_verdict: fresh.verdict,
    stored_verdict: stored,
    neutralised: [...new Set(neutralised)],
    findings: [
      ...kernelFindings(subject, fresh, stored),
      ...ledgerTieOut(db, subject),
      ...evidenceIntegrity(db, subject),
      ...approvalOnFile(db, subject),
    ],
  };
}

/** One finding per failed mark, so a reviewer reads the check that failed rather than a verdict word. */
function kernelFindings(subject: RerunSubject, fresh: KernelResult, stored: KernelVerdict | null): Finding[] {
  const refs = { decision_id: subject.decision_id, entry_id: subject.entry_id ?? undefined };
  const out = fresh.failed.map((mark) =>
    finding("kernel_disagrees", `${mark.check} fails on re-performance: ${mark.detail}`, refs),
  );
  if (out.length === 0 && stored !== null && stored !== fresh.verdict) {
    out.push(finding("kernel_disagrees", `re-performance returns ${fresh.verdict}, the workpaper on file says ${stored}`, refs));
  }
  return out;
}

/** The last workpaper written for the decision: the post gate for anything that actually posted. */
function storedVerdict(db: Db, decisionId: string): KernelVerdict | null {
  const row = db
    .prepare("SELECT kernel_verdict FROM workpaper WHERE decision_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(decisionId) as { kernel_verdict: KernelVerdict } | undefined;
  return row?.kernel_verdict ?? null;
}

/** Nothing to re-perform is itself reportable: the item was sampled and could not be examined. */
function unreadable(db: Db, decisionId: string): RerunResult {
  const detail = `decision ${decisionId} is not a posted live decision with a readable proposal`;
  return {
    decision_id: decisionId,
    fresh_verdict: "unreadable",
    stored_verdict: storedVerdict(db, decisionId),
    neutralised: [],
    findings: [finding("kernel_disagrees", detail, { decision_id: decisionId })],
  };
}
