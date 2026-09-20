import { z } from "zod";
import type { ToolSpec } from "../agents/tools/read.js";
import { getChecklist } from "./conductor.js";

/**
 * The close pack's function read tool, in Person A's ToolSpec shape. Not wired into src/agents: spread
 * CLOSE_TOOL_SPECS into READ_TOOL_SPECS to hand it to an agent. It reads the board as the conductor last stored
 * it and never re-evaluates, so a read tool stays a read. Live only: in replay July's board says how Q2 ended.
 */
export const CLOSE_TOOL_SPECS: ToolSpec[] = [
  {
    name: "close_checklist", registry_name: "close.checklist", input: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }),
    description: "The close checklist for a period ('YYYY-MM'): each item's status (todo, in_progress, blocked, done), what it is stuck on, what it depends on, the decisions it rests on, and counts by status.",
    run: (i, env) => {
      if (env.mode === "replay") return { error: "not available in replay: the checklist describes today's books" };
      const view = getChecklist(env.db, String(i.period));
      return view.items.length > 0 ? view : { error: `no checklist for ${String(i.period)}: the close conductor has not run for it` };
    },
  },
];
