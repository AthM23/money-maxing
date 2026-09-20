import { readFileSync } from "node:fs";
import { z } from "zod";
import { Route, FUNCTIONS } from "../src/contract/types.js";
import { parseCsv } from "./csv.js";
import { DEFAULT_CASES_PATH } from "./paths.js";

const SECTIONS = ["bank-rec", "ap", "revenue", "close", "intercompany", "platform", "control", "boss"] as const;
const TIERS = ["T1", "T2", "T3"] as const;
const STATUSES = ["todo", "seeded", "passing", "failing"] as const;
/** pack values from context/PROJECT_SPEC.md: the Fn packs, plus the two shared layers. */
const PACKS = [...FUNCTIONS, "platform", "kernel"] as const;

/** What cases.csv scores: the five routes, plus INVARIANT — an engineering property, not a route. */
export const ExpectedRoute = z.union([Route, z.literal("INVARIANT")]);
export type ExpectedRoute = z.infer<typeof ExpectedRoute>;

const HEADER = [
  "id",
  "section",
  "title",
  "expected_route",
  "route_qualifier",
  "tier",
  "pack",
  "min_fixture",
  "in_spec_scope",
  "status",
] as const;

const emptyToUndefined = (value: string): string | undefined => (value.length > 0 ? value : undefined);
const yesNo = z.enum(["yes", "no"]).transform((value) => value === "yes");

export const CaseRowSchema = z.object({
  id: z.string().regex(/^[A-Z]-\d{1,2}$/, "id must look like A-01 or H-6"),
  section: z.enum(SECTIONS),
  title: z.string().min(1),
  expected_route: ExpectedRoute,
  route_qualifier: z.string().transform(emptyToUndefined).optional(),
  tier: z.enum(TIERS),
  pack: z.enum(PACKS),
  min_fixture: yesNo,
  in_spec_scope: yesNo,
  status: z.enum(STATUSES),
});
export type CaseRow = z.infer<typeof CaseRowSchema>;

/** Reads and validates the case corpus from disk. Throws with the file path on I/O failure. */
export function loadCases(path: string = DEFAULT_CASES_PATH): CaseRow[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`could not read cases file at ${path}: ${(err as Error).message}`);
  }
  return loadCasesFromText(text);
}

/** The parse+validate core, split out from file I/O so it's exercisable on inline fixtures. */
export function loadCasesFromText(text: string): CaseRow[] {
  const table = parseCsv(text);
  const header = table[0];
  if (header === undefined) {
    throw new Error("cases.csv is empty");
  }
  validateHeader(header);
  return table.slice(1).map((fields, index) => parseCaseRow(fields, index + 2));
}

function validateHeader(header: string[]): void {
  const matches = header.length === HEADER.length && HEADER.every((name, i) => header[i] === name);
  if (!matches) {
    throw new Error(`cases.csv header must be exactly: ${HEADER.join(",")} (got: ${header.join(",")})`);
  }
}

function parseCaseRow(fields: string[], lineNumber: number): CaseRow {
  if (fields.length !== HEADER.length) {
    throw new Error(`cases.csv line ${lineNumber}: expected ${HEADER.length} fields, got ${fields.length}`);
  }
  const record = Object.fromEntries(HEADER.map((key, i) => [key, fields[i]]));
  const result = CaseRowSchema.safeParse(record);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`cases.csv line ${lineNumber}: ${detail}`);
  }
  return result.data;
}
