import type { CaseRow } from "../cases.js";
import type { CaseOutcome, SystemUnderTest } from "../sut.js";
import { caseA13, caseA14, caseB13, caseB23 } from "./kernelPackApDuplicateCases.js";
import { caseB01, caseB02, caseB05, caseB06, caseB14 } from "./kernelPackApVarianceCases.js";
import { caseB24, caseDuplicatePayment, caseF09, caseG02, caseG03, caseG04 } from "./kernelPackControlCases.js";
import type { Outcome } from "./kernelPackFixtures.js";
import { caseG05, caseG06, caseG07, caseG08 } from "./kernelPackLearningCases.js";

/** One case id may be handled by a shared scenario (G-01 and H-1 are both "a human approves a
 *  duplicate payment" in the corpus), so this maps id -> handler, not id -> unique fixture. */
const CASE_HANDLERS: Readonly<Record<string, () => Outcome>> = {
  "G-03": caseG03,
  "G-02": caseG02,
  "B-24": caseB24,
  "G-01": caseDuplicatePayment,
  "H-1": caseDuplicatePayment,
  "G-04": caseG04,
  "F-09": caseF09,
  "G-05": caseG05,
  "G-06": caseG06,
  "G-07": caseG07,
  "G-08": caseG08,
  "B-01": caseB01,
  "B-02": caseB02,
  "B-05": caseB05,
  "B-06": caseB06,
  "B-14": caseB14,
  "B-13": caseB13,
  "A-13": caseA13,
  "A-14": caseA14,
  "B-23": caseB23,
};

/**
 * Drives the real kernel, runtime and learning loop against a hand-built fixture per case id, in a
 * fresh in-memory database each time. No model calls: every case is either a deterministic kernel
 * check or a learning-layer function, so cost_micros and model_calls are always 0. Any case id not
 * in CASE_HANDLERS — and any fixture that throws — comes back NOT_RUN rather than a guess.
 */
export const kernelPackSut: SystemUnderTest = {
  name: "kernel-pack",
  async runCase(c: CaseRow, opts?: { baseline?: boolean }): Promise<CaseOutcome> {
    // This adapter has no rules-disabled run. A report stamped "baseline" that it did not shape would be a false label.
    if (opts?.baseline) throw new Error("--baseline is not implemented by the kernel-pack adapter: run it without the flag");
    const handler = CASE_HANDLERS[c.id];
    if (!handler) return { case_id: c.id, route: "NOT_RUN", cost_micros: 0, model_calls: 0 };
    try {
      const outcome = handler();
      return { case_id: c.id, cost_micros: 0, model_calls: 0, ...outcome };
    } catch (err) {
      return {
        case_id: c.id,
        route: "NOT_RUN",
        cost_micros: 0,
        model_calls: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
