import { bankFile, contractFiles, DEFAULT_STORES_DIR, localChat, localCrm, localMail, policyFiles } from "./local.js";
import type { Connector } from "./types.js";

export type LiveSource = "gmail" | "slack";

/** `--live=gmail,slack` on any CLI. */
export function liveFromArgv(argv: string[]): Set<LiveSource> {
  const raw = argv.find((a) => a.startsWith("--live="))?.split("=")[1] ?? process.env.FOOTNOTE_LIVE ?? "";
  return new Set(raw.split(",").filter((s): s is LiveSource => s === "gmail" || s === "slack"));
}

/**
 * Every source once. A live system REPLACES its local store, never joins it: both carry the same mail, and
 * pulling both would give every message two traces. Live modules are imported only when asked for.
 */
export async function buildConnectors(live: ReadonlySet<LiveSource> = new Set(), dir: string = DEFAULT_STORES_DIR): Promise<Connector[]> {
  const mail = live.has("gmail") ? new (await import("./gmail.js")).GmailConnector() : localMail(dir);
  const chat = live.has("slack") ? new (await import("./slack.js")).SlackConnector() : localChat(dir);
  return [contractFiles(dir), policyFiles(dir), localCrm(dir), mail, chat, bankFile(dir)];
}
