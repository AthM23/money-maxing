import { scoreboard } from "../learn/scoreboard.js";
import { systemClock } from "../runtime/config.js";
import type { Db } from "../runtime/db.js";
import { buildAuditSummary } from "./audit.js";
import { buildAwaitingYou } from "./awaitingYou.js";
import { buildCash } from "./cash.js";
import { buildMemory } from "./memory.js";
import { buildReceipts } from "./receipts.js";
import { buildRules } from "./rules.js";
import type { ConsoleState } from "./types.js";
import { buildWorkpaper } from "./workpaper.js";

export interface ConsoleStateOptions {
  /** Show one decision's workpaper: its tick marks, evidence offsets and (for a foreign receipt) the FX split. */
  decision_id?: string;
  /** Path to a JSON audit pack (pnpm auditpack's output) to summarise alongside the console. */
  audit_pack_path?: string;
}

/**
 * Everything the demo console shows, in one JSON-serialisable document, read from the tables the runtime already
 * writes. Nothing here writes to the database or calls a model, so it is safe to call as often as the UI wants.
 */
export function buildConsoleState(db: Db, opts: ConsoleStateOptions = {}): ConsoleState {
  return {
    generated_at: systemClock.now(),
    cash: buildCash(db),
    receipts: buildReceipts(db),
    workpaper: opts.decision_id ? buildWorkpaper(db, opts.decision_id) : null,
    rules: buildRules(db),
    memory: buildMemory(db),
    awaiting_you: buildAwaitingYou(db),
    scoreboard: scoreboard(db),
    audit: opts.audit_pack_path ? buildAuditSummary(opts.audit_pack_path) : null,
  };
}

export type { ConsoleState } from "./types.js";
