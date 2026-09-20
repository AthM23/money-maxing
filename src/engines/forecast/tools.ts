import { z } from "zod";
import type { ToolSpec } from "../../agents/tools/read.js";
import { getForecast } from "./read.js";

/**
 * `forecast.get` in Person A's ToolSpec shape. Live only: in replay today's forecast already knows how the quarter
 * ended. Not wired into src/agents; to give it to an agent, spread FORECAST_TOOL_SPECS into READ_TOOL_SPECS.
 */
export const FORECAST_TOOL_SPECS: ToolSpec[] = [
  {
    name: "forecast_get", registry_name: "forecast.get", input: z.object({ as_of: z.string().optional() }),
    description:
      "The 13-week cash forecast: the latest version, or the one named by as_of ('<date>/v<n>'). Opening cash, inflows, " +
      "outflows (positive magnitude), minimum weekly closing cash and the 13 weekly buckets, in integer cents. Payroll is not modelled.",
    run: (i, env) => {
      if (env.mode === "replay") return { error: "not available in replay: the forecast reflects today's ledger" };
      return getForecast(env.db, i.as_of ? String(i.as_of) : undefined) ?? { error: i.as_of ? "no such forecast version" : "no forecast has been built yet" };
    },
  },
];
