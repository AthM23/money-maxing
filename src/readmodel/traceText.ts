/**
 * One line for what a tool was asked and what it gave back, short enough for a timeline. The full JSON stays in the
 * database; a trace is for reading, so a search shows its query and how many hits, a read shows which document.
 */
const MAX = 140;

export function summariseInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input !== "object") return clip(String(input));
  const pairs = Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return clip(pairs.join(" · "));
}

export function summariseOutput(output: unknown): string {
  if (output === null || output === undefined) return "nothing";
  if (Array.isArray(output)) return output.length === 0 ? "no results" : `${output.length} result${output.length === 1 ? "" : "s"}${firstId(output[0])}`;
  if (typeof output !== "object") return clip(String(output));
  const o = output as Record<string, unknown>;
  if (typeof o.status === "string") return clip([o.status, o.reason, o.escalation_id, o.decision_id].filter((v) => typeof v === "string").join(" · "));
  if (typeof o.outcome === "string") return clip([o.outcome, o.reason].filter((v) => typeof v === "string").join(" · "));
  if (typeof o.trace_id === "string") return clip(`${o.trace_id}${typeof o.text === "string" ? `: ${o.text.replace(/\s+/g, " ")}` : ""}`);
  return clip(JSON.stringify(o));
}

function firstId(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const o = item as Record<string, unknown>;
  const id = o.trace_id ?? o.id ?? o.fact_id ?? o.policy_id;
  return typeof id === "string" ? ` (first: ${id})` : "";
}

function clip(text: string): string {
  return text.length <= MAX ? text : `${text.slice(0, MAX - 1)}…`;
}
