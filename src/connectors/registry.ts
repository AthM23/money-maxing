/**
 * The connector registry: the one place a source of context is declared.
 *
 * Adding a system — Linear, NetSuite, Ramp, a Drive folder, a vendor portal — is one entry in `CONNECTORS` plus a
 * module that turns that system's records into `RawItem`s. Everything downstream is derived from this list and needs
 * no edit:
 *
 *   - `buildConnectors()` pulls it (local store, or the live API when `--live=<source>` asks for it)
 *   - `ingest()` refuses a `trace` row whose source is not registered here
 *   - `READ_TOOL_SPECS` gives the investigator agent a search tool over it, described in the words written here
 *   - `pnpm connectors` prints the table, including which live sources have their credentials set
 *   - `TraceSource` is inferred from it, so a typo is a compile error rather than an orphaned trace
 *
 * A connector never writes a table. It fetches, shapes and dates; `src/ingest/` is the only writer, so every source
 * gets the same idempotency, the same content hash and versioning, and the same three clocks for free.
 */
import { bankFile, contractFiles, localChat, localCrm, localMail, policyFiles } from "./local.js";
import { localTickets } from "./linear.js";
import type { Connector } from "./types.js";

/** The seeded world's own ids, so a live system shared with other worlds hands back only this one's items. */
export interface WorldIds {
  mail: ReadonlySet<string>;
  chat: ReadonlySet<string>;
  horizon?: string;
}

export interface LiveDef {
  /** Env vars the live pull needs. Listed so `pnpm connectors` can say why a source is not available live. */
  readonly env: readonly string[];
  /** Imported only when this source is asked for live, so a missing key or SDK never breaks a local run. */
  load(): Promise<Connector>;
  /**
   * Live systems that the seeder writes into hold every world ever seeded there. Given here, the pull is filtered to
   * this world: `isSeeded` tells one of our ids from an id the system minted, `ids` picks this source's half of them.
   */
  readonly world?: {
    isSeeded(externalId: string): boolean;
    ids(w: WorldIds): ReadonlySet<string>;
  };
}

/** The search tool the investigator gets over this source. `describes` is the noun phrase the model reads. */
export interface ToolDef {
  readonly name: string;
  readonly registry_name: string;
  readonly describes: string;
}

export interface ConnectorDef {
  /** `trace.source`. A lowercase slug, unique in this list, and permanent: it is stored on every row. */
  readonly source: string;
  /** What a person calls it. */
  readonly label: string;
  /** One line on what this source carries and why finance cares. Printed by `pnpm connectors`. */
  readonly about: string;
  /** The `trace.kind` values this source writes. */
  readonly kinds: readonly string[];
  /** The offline store. Omitted when nothing pulls the source (QuickBooks is a mirror; the workbook is seeded). */
  readonly local?: (dir: string) => Connector;
  readonly live?: LiveDef;
  /** Omitted when the agent reads the source through typed tools instead of text search (bank lines, the QBO mirror). */
  readonly tool?: ToolDef;
  /**
   * Whether the agent must have searched this source before it is allowed to pull a person in. A person's time costs
   * more than a search, so registering a source where approvals and explanations actually live belongs here — but it
   * is a deliberate decision per source, not a consequence of being connected: every extra required search is turns
   * and tokens spent on every case, including the ones that were never going to escalate.
   */
  readonly search_before_escalating?: boolean;
}

/**
 * Registered sources, in ingest order. Order matters once: parties are resolved from aliases and email domains, so
 * the sources that name parties are pulled before the ones that only mention them in free text.
 */
const DEFS = [
  {
    source: "contract",
    label: "Contracts",
    about: "Signed agreements and amendments, front-matter dated. The terms an entry has to agree with.",
    kinds: ["contract"],
    local: contractFiles,
    tool: { name: "contracts_find_clause", registry_name: "contracts.find_clause", describes: "contracts and amendments" },
    search_before_escalating: true,
  },
  {
    source: "file",
    label: "Policy memos",
    about: "The written accounting policy, one trace per section, so a quote points at the rule and not at the memo.",
    kinds: ["policy_memo"],
    local: policyFiles,
    tool: { name: "policy_memo_lookup", registry_name: "policy_memo.lookup", describes: "the written accounting policy memo" },
    search_before_escalating: true,
  },
  {
    source: "crm",
    label: "CRM",
    about: "Deals and account notes: what sales promised, and who owns the relationship when someone has to be asked.",
    kinds: ["deal", "note"],
    local: localCrm,
    tool: { name: "crm_notes", registry_name: "crm.notes", describes: "CRM deal notes" },
  },
  {
    source: "linear",
    label: "Linear",
    about: "Engineering tickets: outages, SLA credits owed, and commitments that explain a short-pay nobody booked.",
    kinds: ["issue", "comment"],
    local: localTickets,
    live: {
      env: ["LINEAR_API_KEY"],
      load: async () => new (await import("./linear.js")).LinearConnector(),
    },
    tool: { name: "tickets_search", registry_name: "tickets.search", describes: "engineering tickets and their comments (Linear): incidents, outages and credits promised to a customer" },
  },
  {
    source: "gmail",
    label: "Gmail",
    about: "Company email. Most context that never reached a system is here.",
    kinds: ["email"],
    local: localMail,
    live: {
      env: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      load: async () => new (await import("./gmail.js")).GmailConnector(),
      world: { isSeeded: (id) => !/^[0-9a-f]{16}$/.test(id), ids: (w) => w.mail },
    },
    tool: { name: "mail_search", registry_name: "mail.search", describes: "company email" },
    search_before_escalating: true,
  },
  {
    source: "slack",
    label: "Slack",
    about: "Internal chat. Where a decision gets made in one line and is never written down anywhere else.",
    kinds: ["chat_message", "human_answer"],
    local: localChat,
    live: {
      env: ["SLACK_BOT_TOKEN"],
      load: async () => new (await import("./slack.js")).SlackConnector(),
      world: { isSeeded: (id) => !id.includes(":"), ids: (w) => w.chat },
    },
    tool: { name: "chat_search", registry_name: "chat.search", describes: "Slack messages" },
    search_before_escalating: true,
  },
  {
    source: "bank",
    label: "Bank feed",
    about: "The bank file: every line, with a running balance as its control total. Read through typed tools, not search.",
    kinds: ["bank_line"],
    local: bankFile,
  },
  {
    source: "workbook",
    label: "Close workbook",
    about: "The prior close workbook and its reviewer comments. Seeded, not pulled: there is no system to pull it from.",
    kinds: ["workbook_tab", "reviewer_comment"],
    tool: { name: "workbook_lookup", registry_name: "workbook.lookup", describes: "the prior close workbook and reviewer comments" },
  },
  {
    source: "qbo",
    label: "QuickBooks Online",
    about: "The accounting system. We mirror accepted entries into it; it is never read back as evidence.",
    kinds: ["journal_entry", "invoice"],
  },
] as const satisfies readonly ConnectorDef[];

/** Inferred from the list above, so a source that is not registered cannot be written. */
export type TraceSource = (typeof DEFS)[number]["source"];

/** The same list, widened: `as const` is only there to infer `TraceSource`, and narrows away the optional fields. */
export const CONNECTORS: readonly ConnectorDef[] = DEFS;

const BY_SOURCE = new Map<string, ConnectorDef>(CONNECTORS.map((c) => [c.source, c]));

export function connectorDef(source: string): ConnectorDef | undefined {
  return BY_SOURCE.get(source);
}

export function isRegisteredSource(source: string): source is TraceSource {
  return BY_SOURCE.has(source);
}

/** Sources that can be pulled from the real system, and so can be named in `--live=`. */
export const LIVE_SOURCES: readonly string[] = CONNECTORS.filter((c) => c.live !== undefined).map((c) => c.source);

/** Which live sources have every env var they need. `pnpm connectors` prints this; nothing decides behaviour from it. */
export function liveCredentials(def: ConnectorDef, env: NodeJS.ProcessEnv = process.env): { ready: boolean; missing: string[] } {
  const missing = (def.live?.env ?? []).filter((k) => !env[k]?.trim());
  return { ready: def.live !== undefined && missing.length === 0, missing };
}
