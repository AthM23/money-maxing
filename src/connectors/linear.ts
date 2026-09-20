/**
 * Linear, as the worked example of connecting your own source.
 *
 * Everything a connector has to do is in this file and nothing else — shape the source's records as `RawItem`s, date
 * them with the source's own clock, and hint at the party. Registration in `registry.ts` is one entry; from there it
 * is ingested, versioned, searchable by the agent and visible in `pnpm connectors` with no further code.
 *
 * Why a finance agent wants tickets: an outage that engineering tracked and a CSM promised a credit for is the
 * commonest reason a customer short-pays an invoice with no email to show for it. The ticket is the evidence.
 *
 * Local: `data/stores/linear.json` (offline, used by tests and by any seeded world).
 * Live:  LINEAR_API_KEY, a personal API key, sent raw in the Authorization header as Linear's GraphQL API expects.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_STORES_DIR } from "./local.js";
import type { Connector, RawItem } from "./types.js";

export interface TicketComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  /** The human key, e.g. `ENG-412`. Used as the external id, because it is what people quote. */
  identifier: string;
  title: string;
  body: string;
  state: string;
  team: string;
  labels: string[];
  url: string;
  created_at: string;
  updated_at: string;
  comments?: TicketComment[];
}

/** A `customer:<party_id>` label names the party outright; anything else falls back to text resolution. */
function partyHint(t: Ticket): RawItem["party_hint"] {
  const labelled = t.labels.find((l) => l.startsWith("customer:"));
  if (labelled) return { party_id: labelled.slice("customer:".length) };
  return { text: `${t.title} ${t.body}` };
}

/** One trace per ticket, plus one per comment: a quote should point at the sentence that promised the credit. */
export function ticketItems(tickets: readonly Ticket[]): RawItem[] {
  return tickets.flatMap((t): RawItem[] => {
    const hint = partyHint(t);
    const issue: RawItem = {
      source: "linear",
      kind: "issue",
      external_id: t.identifier,
      event_time: t.created_at,
      recorded_time: t.updated_at,
      payload: { identifier: t.identifier, title: t.title, state: t.state, team: t.team, labels: t.labels.join(", "), url: t.url, body: t.body },
      party_hint: hint,
    };
    const comments = (t.comments ?? []).map((c): RawItem => ({
      source: "linear",
      kind: "comment",
      external_id: `${t.identifier}#${c.id}`,
      event_time: c.created_at,
      recorded_time: c.created_at,
      payload: { identifier: t.identifier, title: t.title, author: c.author, body: c.body },
      party_hint: hint,
    }));
    return [issue, ...comments];
  });
}

/** The offline store. A missing file yields nothing rather than an error, like every other local store. */
export function localTickets(dir: string = DEFAULT_STORES_DIR): Connector {
  return {
    name: "local-tickets",
    async pull() {
      const path = join(dir, "linear.json");
      if (!existsSync(path)) return [];
      const raw = JSON.parse(readFileSync(path, "utf8")) as { issues?: Ticket[] } | Ticket[];
      return ticketItems(Array.isArray(raw) ? raw : (raw.issues ?? []));
    },
  };
}

// ---------------------------------------------------------------- live

const ENDPOINT = "https://api.linear.app/graphql";

const QUERY = `query Issues($after: String) {
  issues(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title description url createdAt updatedAt
      state { name }
      team { key }
      labels { nodes { name } }
      comments { nodes { id body createdAt user { name } } }
    }
  }
}`;

interface GqlIssue {
  identifier: string; title: string; description: string | null; url: string; createdAt: string; updatedAt: string;
  state: { name: string } | null;
  team: { key: string } | null;
  labels: { nodes: Array<{ name: string }> };
  comments: { nodes: Array<{ id: string; body: string; createdAt: string; user: { name: string } | null }> };
}

interface GqlResponse {
  data?: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlIssue[] } };
  errors?: Array<{ message: string }>;
}

export function linearKeyFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.LINEAR_API_KEY?.trim();
  if (!key) throw new Error("Linear is not configured: missing env LINEAR_API_KEY (a personal API key from Linear → Settings → API)");
  return key;
}

function toTicket(n: GqlIssue): Ticket {
  return {
    id: n.identifier, identifier: n.identifier, title: n.title, body: n.description ?? "",
    state: n.state?.name ?? "unknown", team: n.team?.key ?? "", labels: n.labels.nodes.map((l) => l.name),
    url: n.url, created_at: n.createdAt, updated_at: n.updatedAt,
    comments: n.comments.nodes.map((c) => ({ id: c.id, author: c.user?.name ?? "unknown", body: c.body, created_at: c.createdAt })),
  };
}

/**
 * Throws at construction when the key is missing, so a misconfigured run dies before it pulls anything — the same
 * contract the Gmail and Slack connectors keep.
 *
 * UNVERIFIED: not run against a real Linear workspace (no API key on this machine). The query and the raw
 * Authorization header follow Linear's documented GraphQL API; the offline path above is what the tests cover.
 */
export class LinearConnector implements Connector {
  readonly name = "linear";
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { key?: string; fetchImpl?: typeof fetch } = {}) {
    this.key = opts.key ?? linearKeyFromEnv();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async pull(): Promise<RawItem[]> {
    const tickets: Ticket[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const body: GqlResponse = await this.post(after);
      const issues = body.data?.issues;
      if (!issues) throw new Error(`Linear returned no issues: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
      tickets.push(...issues.nodes.map(toTicket));
      if (!issues.pageInfo.hasNextPage) break;
      after = issues.pageInfo.endCursor;
    }
    return ticketItems(tickets);
  }

  private async post(after: string | null): Promise<GqlResponse> {
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { authorization: this.key, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { after } }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Linear GraphQL failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text) as GqlResponse;
  }
}
