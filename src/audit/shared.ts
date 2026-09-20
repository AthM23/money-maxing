import { Proposal } from "../contract/types.js";
import { sumCredits, sumDebits } from "../kernel/util.js";
import { safeJson } from "../runtime/lookups.js";
import type { Finding, FindingRefs, FindingType } from "./types.js";

/** Legal-form words that tell two vendor rows apart on paper but not in fact. */
const VENDOR_SUFFIXES: ReadonlySet<string> = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company",
]);

/**
 * Restrict a query to one period through the stored proposal. Parameterised twice on purpose:
 * `LIKE period || '%'` would treat an underscore in the period id as a wildcard.
 */
export const PERIOD_PREDICATE = "substr(json_extract(d.proposal_json, '$.entry_date'), 1, length(?)) = ?";

export function finding(type: FindingType, detail: string, refs: FindingRefs): Finding {
  return { type, detail, refs };
}

/** A decision's proposal as stored. Null when the column is empty or the JSON no longer reads. */
export function parseProposal(json: string | null): Proposal | null {
  if (!json) return null;
  const parsed = Proposal.safeParse(safeJson(json));
  return parsed.success ? parsed.data : null;
}

/**
 * What the entry moved, as an auditor sizes it: the footed side of the journal entry, or what it
 * applied when the kind posts no lines. Deliberately NOT the kernel's judgment-only adjustment —
 * authority and thresholds are tested against the money that moved, not against how much of it
 * the preparer called a judgment.
 */
export function entryAmountCents(proposal: Proposal): number {
  const side = Math.max(sumDebits(proposal.entries), sumCredits(proposal.entries));
  if (side > 0) return side;
  return proposal.applications.reduce((total, app) => total + app.amount_cents, 0);
}

/** Case, punctuation and legal suffix stripped, so "Acme, Inc." and "ACME LLC" collide. */
export function normaliseVendorName(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  while (words.length > 1 && VENDOR_SUFFIXES.has(words[words.length - 1] ?? "")) words.pop();
  return words.join(" ");
}

/**
 * JSON compared by what it says, not by how it was typed: key order and whitespace are not
 * differences, so the same bank details under two vendor rows collide the way they should.
 * Text that does not parse is compared as itself rather than thrown away.
 */
export function canonicalJson(text: string): string {
  const parsed = safeJson(text);
  return parsed === null ? text.trim() : JSON.stringify(sortKeys(parsed));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
  return out;
}

/** Group values by a key, keeping insertion order. Used wherever "these rows collide" is the finding. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
