import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bankFile, contractFiles, DEFAULT_STORES_DIR, localChat, localCrm, localMail, policyFiles } from "./local.js";
import type { Connector, RawItem } from "./types.js";

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
  const seeded = seededIds(dir);
  const mail = live.has("gmail") ? onlyThisWorld(new (await import("./gmail.js")).GmailConnector(), seeded?.mail, seeded?.horizon, (id) => !/^[0-9a-f]{16}$/.test(id)) : localMail(dir);
  const chat = live.has("slack") ? onlyThisWorld(new (await import("./slack.js")).SlackConnector(), seeded?.chat, seeded?.horizon, (id) => !id.includes(":")) : localChat(dir);
  return [contractFiles(dir), policyFiles(dir), localCrm(dir), mail, chat, bankFile(dir)];
}

/** The seeded ids of the world these stores hold (`world.json`, written by the seeder). Older stores have none. */
function seededIds(dir: string): { mail: Set<string>; chat: Set<string>; horizon?: string } | undefined {
  // mail ids and mail content keys share one set: a world id never looks like `date|sender|subject`
  const path = join(dir, "world.json");
  if (!existsSync(path)) return undefined;
  const w = JSON.parse(readFileSync(path, "utf8")) as { mail_ids?: string[]; mail_keys?: string[]; chat_ids?: string[]; horizon?: string };
  return { mail: new Set([...(w.mail_ids ?? []), ...(w.mail_keys ?? [])]), chat: new Set(w.chat_ids ?? []), horizon: w.horizon };
}

/**
 * The demo mailbox and workspace hold every world that was ever seeded into them. An item seeded for another world is
 * dropped, or the Northwind world's CEO email would turn up as evidence in the global July. Mail and messages nobody
 * seeded (a real person writing in) are kept: `isSeeded` tells a world id from the system's own id. One exception:
 * an unseeded item dated inside the world's own timeline (up to `horizon`, the end of its last period) is a backdated
 * fixture whose world id was lost, as Gmail did to the first seed run (status log, 09-19 21:05). It is dropped too,
 * unless it is this world's own mail, recognised the way the Gmail reader recognises a copy: second, sender, subject.
 */
export function onlyThisWorld(connector: Connector, ids: ReadonlySet<string> | undefined, horizon: string | undefined, isSeeded: (externalId: string) => boolean): Connector {
  if (!ids) return connector;
  return {
    name: connector.name,
    async pull(): Promise<RawItem[]> {
      const own = (i: RawItem): boolean => {
        const p = i.payload as { date?: string; from?: string; subject?: string };
        return typeof p.from === "string" && ids.has(`${p.date}|${p.from.toLowerCase()}|${p.subject}`);
      };
      return (await connector.pull()).filter((i) => (isSeeded(i.external_id) ? ids.has(i.external_id) : !horizon || i.recorded_time > horizon || own(i)));
    },
  };
}
