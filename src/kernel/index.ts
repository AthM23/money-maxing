/**
 * The kernel: a pure re-performance of the workpaper behind a proposed entry.
 *
 * It trusts nothing the agent asserted. Every number is recomputed from the data handed to it
 * in a KernelContext, and the result is a set of audit tick marks — F footed, E agreed to
 * source, P approved by, J per policy — plus a verdict. It never calls a model, a database or
 * the network, so an auditor can re-run it on any entry and get the same answer.
 */
export { runKernel } from "./run.js";
export { evaluateCondition } from "./condition.js";
export { adjustmentCents } from "./util.js";

export { checkF1, checkF2, checkF3, checkF7, arGlDelta, apGlDelta, subledgerDeltas } from "./formal.js";
export { checkE1, checkE2, checkE3, checkE5 } from "./evidence.js";
export { checkP1, checkP2, checkP3, checkP4, checkP5, checkP6, checkP9 } from "./process.js";
export { checkJ1, checkJ2, checkJ3 } from "./judgment.js";
export { evaluateBlockRules, type TriggeredRule } from "./blockRules.js";
export { normalizeWs } from "./util.js";
export type * from "./types.js";
