import type { Condition, ConditionLeaf } from "./types.js";

type Features = Readonly<Record<string, string | number | boolean>>;
type Scalar = string | number | boolean;

/**
 * The small rule language compiled policies use. Evaluated in code, never by a model.
 * An unknown field, a mistyped comparison or an unknown operator is false, never a throw:
 * a policy that cannot be evaluated has not been satisfied.
 */
export function evaluateCondition(cond: Condition, features: Features): boolean {
  if (isAll(cond)) return cond.all.every((child) => evaluateCondition(child, features));
  if (isAny(cond)) return cond.any.some((child) => evaluateCondition(child, features));
  return evaluateLeaf(cond, features);
}

function isAll(cond: Condition): cond is { all: Condition[] } {
  return typeof cond === "object" && cond !== null && "all" in cond && Array.isArray(cond.all);
}

function isAny(cond: Condition): cond is { any: Condition[] } {
  return typeof cond === "object" && cond !== null && "any" in cond && Array.isArray(cond.any);
}

function evaluateLeaf(leaf: ConditionLeaf, features: Features): boolean {
  if (!leaf || typeof leaf.field !== "string") return false;
  if (!Object.prototype.hasOwnProperty.call(features, leaf.field)) return false;
  const actual = features[leaf.field];
  if (actual === undefined) return false;
  return applyOperator(leaf.op, actual, leaf.value);
}

function applyOperator(op: ConditionLeaf["op"], actual: Scalar, expected: ConditionLeaf["value"]): boolean {
  if (op === "==") return Array.isArray(expected) ? false : actual === expected;
  if (op === "!=") return Array.isArray(expected) ? false : actual !== expected;
  if (op === "in") return Array.isArray(expected) && expected.some((item) => item === actual);
  return compare(op, actual, expected);
}

function compare(op: "<=" | "<" | ">=" | ">", actual: Scalar, expected: ConditionLeaf["value"]): boolean {
  const ordered = orderable(actual, expected);
  if (ordered === undefined) return false;
  const [left, right] = ordered;
  if (op === "<=") return left <= right;
  if (op === "<") return left < right;
  if (op === ">=") return left >= right;
  return left > right;
}

/** Only number-to-number and string-to-string are ordered. Anything else is not comparable. */
function orderable(actual: Scalar, expected: ConditionLeaf["value"]): [number, number] | [string, string] | undefined {
  if (typeof actual === "number" && typeof expected === "number") return [actual, expected];
  if (typeof actual === "string" && typeof expected === "string") return [actual, expected];
  return undefined;
}
