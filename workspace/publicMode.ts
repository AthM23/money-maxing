import { HttpError } from "./http.js";

/**
 * A copy of the workspace that anyone can open: nothing can be written through it and nothing on it costs money. It is
 * the only way this server listens beyond this machine. A server that can post entries, record approvals or call a
 * paid model stays on 127.0.0.1.
 *
 *   WORKSPACE_PUBLIC=1 pnpm workspace <db>      listens on 0.0.0.0 (or HOST), read-only
 */
export interface Listening { host: string; readOnly: boolean }

export function listening(env: NodeJS.ProcessEnv = process.env): Listening {
  const readOnly = env.WORKSPACE_PUBLIC === "1";
  if (!readOnly && env.HOST && env.HOST !== "127.0.0.1" && env.HOST !== "localhost") {
    throw new Error("HOST is set but WORKSPACE_PUBLIC is not: a workspace that can write is never bound beyond this machine");
  }
  return { host: readOnly ? env.HOST ?? "0.0.0.0" : "127.0.0.1", readOnly };
}

/** What a read-only copy still answers: the books as tools, questions routed by code, and the audit, which writes nothing. */
const READS: ReadonlySet<string> = new Set(["tool", "ask", "audit"]);

/** Throws unless this action is allowed on a read-only copy. `ask` is allowed only in code mode: no model, no bill. */
export function assertAllowed(action: string, body: unknown, readOnly: boolean): void {
  if (!readOnly) return;
  if (!READS.has(action)) throw new HttpError(403, "This public copy is read-only. Decisions, approvals and runs are made in the team's own workspace.");
  const model = typeof body === "object" && body !== null ? (body as { model?: unknown }).model : undefined;
  if (action === "ask" && model !== undefined && model !== "code") throw new HttpError(403, "This public copy answers from code only. The agent runs in the team's own workspace.");
}
