import type { Db } from "../ledger/db.js";
import type { World } from "./world.js";

/**
 * The world's people carry placeholder Slack ids (`U_DANA`). Person A's transport DMs `party.owner_user` and finds an
 * approver by `approver.slack_user`, so both must hold ids that exist in the real workspace.
 *
 *   SLACK_USER_MAP      JSON, world person id -> real Slack user id, e.g. {"U_SAM":"U0123","U_CTRL":"U0456"}
 *   SLACK_DEFAULT_USER  one real id for everyone the map leaves out (a one-person demo workspace)
 *
 * Who plays which role is a human decision, so nothing is guessed: with neither variable set, nothing changes.
 * `approver.id` stays the world id on purpose: it is the identity the kernel checks (preparer is not approver, the
 * approver's limit), and the answer key and tests refer to it.
 */
export function slackUserMapFromEnv(world: World, env: NodeJS.ProcessEnv = process.env, matched: Record<string, string> = {}): Record<string, string> {
  let explicit: Record<string, string> = {};
  if (env.SLACK_USER_MAP) {
    try {
      explicit = JSON.parse(env.SLACK_USER_MAP) as Record<string, string>;
    } catch {
      throw new Error('SLACK_USER_MAP must be JSON, e.g. {"U_SAM":"U0123ABC"}');
    }
  }
  const known = new Set(world.people.map((p) => p.id));
  const unknown = Object.keys(explicit).filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`SLACK_USER_MAP names people the world does not have: ${unknown.join(", ")}`);
  const out: Record<string, string> = {};
  for (const p of world.people) {
    const real = explicit[p.id] ?? matched[p.id] ?? env.SLACK_DEFAULT_USER;
    if (real) out[p.id] = real;
  }
  return out;
}

export interface ApplyResult { owners: number; approvers: number }

/** Idempotent: rows already carrying a real id are matched through the world file, not through their current value. */
export function applySlackUserMap(db: Db, world: World, map: Record<string, string>): ApplyResult {
  const result: ApplyResult = { owners: 0, approvers: 0 };
  db.transaction(() => {
    for (const party of world.parties) {
      const real = party.owner ? map[party.owner] : undefined;
      if (real) result.owners += db.prepare("UPDATE party SET owner_user = ? WHERE id = ?").run(real, party.id).changes;
    }
    for (const person of world.people) {
      const real = map[person.id];
      if (real && person.limit_cents !== undefined) result.approvers += db.prepare("UPDATE approver SET slack_user = ? WHERE id = ?").run(real, person.id).changes;
    }
  })();
  return result;
}
