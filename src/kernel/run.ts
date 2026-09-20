import type { KernelResult, KernelStage, KernelVerdict, Mark } from "../contract/types.js";
import { Proposal } from "../contract/types.js";
import { evaluateBlockRules, type TriggeredRule } from "./blockRules.js";
import { evidenceMarks } from "./evidence.js";
import { formalMarks } from "./formal.js";
import { checkJ3, judgmentMarks } from "./judgment.js";
import { processMarks } from "./process.js";
import type { KernelContext } from "./types.js";
import { adjustmentCents, errorMessage, failMark } from "./util.js";

/**
 * Re-perform the workpaper for a proposed entry. Nothing the agent asserted is trusted:
 * every number is recomputed from the data in ctx. No model, no database, no network.
 */
export function runKernel(proposal: Proposal, ctx: KernelContext, stage: KernelStage): KernelResult {
  const parsed = Proposal.safeParse(proposal);
  if (!parsed.success) return schemaReject(parsed.error, stage);
  const validated = parsed.data;

  const adjustment = adjustmentCents(validated, ctx);
  const formal = formalMarks(validated, ctx);
  const evidence = evidenceMarks(validated, ctx);
  const judgment = judgmentMarks(validated, ctx, adjustment, checkJ3(validated));
  const extra = extraMarks(validated, ctx);
  // Process checks come last because they need to know whether a person must approve, and that depends on the rest.
  const required = requiresApproval(ctx, adjustment, [...formal, ...evidence, ...judgment, ...extra]);
  const marks: Mark[] = [...formal, ...evidence, ...processMarks(validated, ctx, stage, required, adjustment), ...judgment, ...extra];
  const triggered = evaluateBlockRules(validated, ctx, stage, adjustment);
  marks.push(...triggered.map((item) => item.mark));

  return buildResult(stage, required, marks, triggered);
}

/**
 * A person must approve when the agent is not on auto, when the adjustment reaches materiality, or when any check,
 * the kernel's own or a pack's, came back as judgment: something the code could not re-perform is a person's call.
 */
function requiresApproval(ctx: KernelContext, adjustment: number, marks: readonly Mark[]): boolean {
  if (ctx.autonomy_level !== "auto") return true;
  if (adjustment >= ctx.materiality_cents) return true;
  return marks.some((m) => m.status === "judgment");
}

/**
 * Pack-specific checks (three-way match, bank-rec match groups, forecast opening cash).
 * A throwing extra check becomes a failing mark: it never escapes and never silently passes.
 */
function extraMarks(proposal: Proposal, ctx: KernelContext): Mark[] {
  const out: Mark[] = [];
  for (const check of ctx.extra_checks ?? []) {
    try {
      out.push(...check(proposal, ctx));
    } catch (err) {
      out.push(failMark("F", "X0", `extra check threw: ${errorMessage(err)}`, [proposal.intent_id]));
    }
  }
  return out;
}

/** Structural view of a zod error, so the kernel does not pin a zod major version in its types. */
interface SchemaError {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/** A proposal that is not even shaped like a Proposal is rejected, not thrown on. */
function schemaReject(error: SchemaError, stage: KernelStage): KernelResult {
  const issues = error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
  const m = failMark("F", "F0", `proposal does not match the Proposal schema: ${issues}`, []);
  return {
    stage,
    verdict: "reject",
    requires_approval: true,
    marks: [m],
    failed: [m],
    checkable_num: 1,
    checkable_den: 1,
  };
}

function buildResult(
  stage: KernelStage,
  required: boolean,
  marks: Mark[],
  triggered: readonly TriggeredRule[],
): KernelResult {
  const failed = marks.filter((m) => m.status === "fail");
  const first = triggered[0];
  const verdict: KernelVerdict = first ? "block" : failed.length > 0 ? "reject" : "accept";
  const result: KernelResult = {
    stage,
    verdict,
    requires_approval: required,
    marks,
    failed,
    checkable_num: marks.filter((m) => m.status === "pass" || m.status === "fail").length,
    checkable_den: marks.length,
  };
  if (first) result.block_rule = first.rule;
  return result;
}
