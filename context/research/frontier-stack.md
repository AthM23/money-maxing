# Frontier Agent Stack — Technical Due Diligence

Compiled 2026-09-19 for the HackMIT 2026 / Maximor "Agentic Systems for the Office of the CFO" entry.

**Method:** WebSearch + WebFetch against official docs/repos only, run as five parallel, independently-scoped research passes (one per section below). All page content was treated as data, not instructions — any embedded instructions on fetched pages were ignored. Anything not directly confirmed against a primary source is explicitly marked **unverified** rather than guessed.

---

## A. Claude Agent SDK

### 1. Current versions (verified directly against registry APIs)
- **TypeScript** `@anthropic-ai/claude-agent-sdk`: **v0.3.278**, published 2026-09-19T01:49:39Z. Verified via `https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/latest` (raw JSON; 303 total versions published). Peer deps: `zod@^4.0.0`, `@anthropic-ai/sdk@>=0.93.0`, `@modelcontextprotocol/sdk@^1.29.0`. Engines: `node >=18.0.0`.
- **Python** `claude-agent-sdk`: **v0.2.157**, published 2026-09-18T18:21:15Z. Verified via `https://pypi.org/pypi/claude-agent-sdk/json`. Requires `python>=3.10`.
- Sources: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk , https://pypi.org/project/claude-agent-sdk/
- **Note:** the package was renamed from `claude-code-sdk` (Python) / `@anthropic-ai/claude-code-sdk` (TS). A migration guide exists at `/docs/en/agent-sdk/migration-guide`. Older tutorials online may reference the old package name/API — treat those as stale.

### 2. Subagents
Doc: https://code.claude.com/docs/en/agent-sdk/subagents

Two ways to define them:
- **Programmatic** (recommended for SDK apps): the `agents` option on `query()`, an object of `{ [name]: AgentDefinition }`. Claude invokes them via the built-in `Agent` tool.
- **Filesystem-based**: `.claude/agents/*.md` frontmatter (same convention as the Claude Code CLI). Programmatic definitions override filesystem ones with the same name.
- A built-in `general-purpose` subagent is always callable even if you define none (disable via `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`).

`AgentDefinition` fields: `description` (required), `prompt` (required), `tools`, `disallowedTools`, `model` (`'fable'|'opus'|'sonnet'|'haiku'|'inherit'|<model-id>`), `skills` (preload list), `memory` (`'user'|'project'|'local'`), `mcpServers`, `initialPrompt`, `maxTurns`, `background`, `omitClaudeMd` (TS 0.3.271+), `effort`, `permissionMode`.

Mechanics worth knowing: subagents run **in the background by default** unless forced otherwise; nesting depth defaults to 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), concurrency defaults to 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), and total spend can be capped with `maxBudgetUsd`/`max_budget_usd` (ends the run with `error_max_budget_usd`) — useful for not blowing a demo budget. Subagents can be resumed: capture `session_id`/`agentId` from the Agent tool result, then pass `resume: sessionId` on a later query using the same agent definition.

### 3. Skills
Doc: https://code.claude.com/docs/en/agent-sdk/skills

**No programmatic API** — skills are filesystem-only: a directory with `SKILL.md` (YAML frontmatter + Markdown) under `.claude/skills/<name>/` (project) or `~/.claude/skills/` (personal), auto-discovered when `settingSources`/`setting_sources` includes `'project'`/`'user'`. The `skills` option on `query()` scopes which discovered skills Claude may invoke: omit to allow all discovered skills (default), pass `"all"` explicitly, a specific name list, or `[]` to disable discovery entirely. This is the clean distinction from subagents: subagents are code objects defined in your program; skills are always files on disk.

### 4. Hooks
Doc: https://code.claude.com/docs/en/agent-sdk/hooks

**12 confirmed event names**, read directly from a table in the doc: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd`, `Notification`. (The doc text also mentions a `PermissionRequest` hook input type in passing — **unverified** whether this is a distinct top-level event or folded into the `PreToolUse` flow.)

Config shape: `options.hooks = { EventName: [{ matcher?: "Regex|OnToolNames", hooks: [callbackFn] }] }`. Matcher matches tool name for tool-related events (supports `"Write|Edit"`, `"^mcp__"`, wildcards); omit to fire on every occurrence. Callback receives typed input (e.g. `PreToolUseHookInput` has `tool_name`/`tool_input`) and can return `permissionDecision: "allow"|"deny"|"ask"|"defer"` (PreToolUse) or `additionalContext`/`updatedToolOutput` (PostToolUse).

```typescript
import { query, HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

const protectEnvFiles: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return {};
  const preInput = input as PreToolUseHookInput;
  if (String(preInput.tool_input?.file_path ?? "").includes(".env")) {
    return { permissionDecision: "deny", permissionDecisionReason: "Refusing to touch .env files" };
  }
  return {};
};

for await (const message of query({
  prompt: "Update the config",
  options: { hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [protectEnvFiles] }] } }
})) { /* ... */ }
```

### 5. Custom in-process tools + MCP servers
Docs: https://code.claude.com/docs/en/agent-sdk/custom-tools , https://code.claude.com/docs/en/agent-sdk/mcp

**In-process custom tool**: `tool(name, description, zodSchemaObject, handler)` → wrap one or more in `createSdkMcpServer({ name, version, tools: [...] })` → pass via `options.mcpServers`. The fully-qualified tool name Claude sees is `mcp__{server_name}__{tool_name}` — it must appear in `allowedTools` (or a `mcp__server__*` wildcard) or Claude will see it but hit a permission prompt. Handlers return `{ content: [...], structuredContent?, isError? }`; content blocks can be `text`, `image` (base64, no URL field), `audio`, `resource`, `resource_link`.

**External MCP servers** — three transports, all via `options.mcpServers`:
- `stdio`: `{ command: "npx", args: [...] }` — local process.
- `http`/`sse`: `{ type: "http"|"sse", url, headers? }` — remote server; supports Bearer tokens or your own pre-completed OAuth access token in headers (the SDK itself does **not** run an interactive OAuth flow).
- In-process SDK server (the custom-tool case above).

Connection status surfaces in the `system`/`init` message (`mcp_servers` array, status `pending|connected|failed|needs-auth|disabled`); a stdio/HTTP server without a cached tool list **delays the first turn** up to `MCP_TIMEOUT` (default 30s).

### 6. Sessions and resume
Doc: https://code.claude.com/docs/en/agent-sdk/sessions

- **Continue**: `continue: true` (TS) / re-querying with `ClaudeSDKClient` (Python) — picks up the most recent session in `cwd`, no ID tracking needed.
- **Resume**: pass `resume: sessionId` — targets a specific session (needed for multi-user apps). Capture `session_id` from the `ResultMessage`/`SDKResultMessage`, present on every result (success or error).
- **Fork**: `resume: sessionId, forkSession: true` (`fork_session=True` in Python) — branches history into a new session ID; the original is untouched.
- Sessions are stored as JSONL at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` — **local disk only**. For cross-host/serverless resume, attach a `SessionStore` adapter (`options.sessionStore`) that mirrors transcripts to your own backend (object store/KV/DB); a failed mirror emits a `mirror_error` system message rather than failing the query.
- Python's `ClaudeSDKClient` holds a session open across turns as an async context manager; TypeScript has no equivalent object — use `continue: true` per call instead. (The old TS "V2 session API" with `createSession()` was removed in SDK 0.3.142 — ignore tutorials referencing it.)

### 7. Structured output
Doc: https://code.claude.com/docs/en/agent-sdk/structured-outputs

Pass `outputFormat: { type: "json_schema", schema }` (`output_format` in Python). The result message carries `structured_output` once validated. The SDK **validates and re-prompts on mismatch**; failing after retries yields `subtype: "error_max_structured_output_retries"`. A `"success"` result can still have `structured_output` unset — treat that as a failure too. Use Zod (`z.toJSONSchema(schema, { target: "draft-7" })` — must target draft-7; Zod defaults to 2020-12) or Pydantic (`.model_json_schema()`) to generate the schema. Works alongside normal tool use — the agent can call tools, then emit the final schema-shaped object.

### 8. Streaming events to a web UI
Doc: https://code.claude.com/docs/en/agent-sdk/streaming-output (distinct from `/streaming-vs-single-mode`, which covers input modes, not output streaming)

Set `includePartialMessages: true` (`include_partial_messages` in Python) to receive `StreamEvent`/`SDKPartialAssistantMessage` objects wrapping **raw Claude API stream events** verbatim (`message_start`, `content_block_start`, `content_block_delta` [`text_delta`/`input_json_delta`], `content_block_stop`, `message_delta`, `message_stop`), interleaved with complete `AssistantMessage`s and a final `ResultMessage`.

**There is no built-in SSE/WebSocket helper.** The documented pattern is to iterate the async generator server-side in your own Node process and forward each `stream_event` yourself over whatever transport you choose. The doc's own "build a streaming UI" example does exactly this (tracks an `in_tool` flag, writes text deltas, shows `[Using ToolName...]` indicators) — swap `console.log` for writes to your response stream. Structured output is **not** streamed — it only appears in the final `ResultMessage.structured_output`.

### 9. Token usage and cost per run
Doc: https://code.claude.com/docs/en/agent-sdk/cost-tracking

- Per-step: `AssistantMessage.message.usage` (TS) / `AssistantMessage.usage` (Python) has `input_tokens`/`output_tokens` + cache fields. Parallel tool-call messages **share the same message id** — dedupe by id or you'll double-count input tokens. Per-step `output_tokens` is a placeholder captured at `message_start`; read real output tokens from the final `ResultMessage`.
- Cumulative: `ResultMessage.total_cost_usd` (present on success and error) and `ResultMessage.modelUsage`/`model_usage` (per-model breakdown, requires Claude Code v2.1.246+). These **include subagent spend**; the plain `usage` field on the result does **not** (main-loop only) — use `modelUsage` for whole-tree accounting.
- **Explicit caveat from Anthropic**: *"`total_cost_usd` and `costUSD` fields are client-side estimates, not authoritative billing data."* For real billing, use the Usage and Cost API (`platform.claude.com/docs/en/build-with-claude/usage-cost-api`) — don't bill end users off the SDK's own number.

### 10. Next.js / Node server gotchas (the single biggest architectural issue for this team)
Doc: https://code.claude.com/docs/en/agent-sdk/hosting

`query()` spawns and supervises a **`claude` CLI subprocess over stdio** — it is not a pure in-process API client. Concretely:
- **Must run in the Node.js runtime, not Edge.** Next.js Route Handlers default to Node, but any route with `export const runtime = "edge"` will fail — Edge Functions can't spawn child processes.
- **Binary bundling**: both SDKs bundle a native `claude` CLI binary per platform (the Python wheel alone was 396MB across platform wheels at the pinned version checked). On Vercel's serverless bundler this can hit function size limits unless explicitly included (`outputFileTracingIncludes` in Next.js) or Claude Code is installed separately with `pathToClaudeCodeExecutable` pointed at it. "CLI present but won't launch" (arch/libc mismatch, lost execute permission) is a named, documented failure mode.
- **Session/transcript state is local disk by default** and is **lost** on cold start / redeploy / scale-out to a different instance — directly relevant for a multi-turn contract→invoice→collections pipeline. A `SessionStore` adapter is required to persist/resume sessions across serverless invocations; this is not automatic.
- **No top-level session timeout** — set `maxTurns`/`max_turns` yourself so a run finishes inside your function's execution-time limit.
- **Concurrency is subprocess-bound**: ~1 GiB RAM / 1 CPU per active agent session is Anthropic's stated floor; size concurrent-session capacity against your function's memory limit.
- **Auth**: the subprocess reads `ANTHROPIC_API_KEY` from its environment — standard Vercel env var, but never let it leak into a client bundle.
- **Multi-tenant isolation**: if multiple demo users hit the same warm instance, pass a distinct `cwd` per session, `settingSources: []`, and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, or one user's CLAUDE.md/session config can leak into another's.

### Minimal TypeScript example: orchestrator, 2 subagents, 1 custom tool
`npm i @anthropic-ai/claude-agent-sdk zod`; save as `.mts` or set `"type": "module"`.

```typescript
import { query, tool, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// --- 1. Custom in-process tool: look up an invoice in your own DB ---
const getInvoiceStatus = tool(
  "get_invoice_status",
  "Look up payment status and amount due for an invoice by its ID",
  { invoiceId: z.string().describe("Invoice ID, e.g. INV-10234") },
  async (args) => {
    const invoice = await lookupInvoiceInDb(args.invoiceId); // your DB call
    if (!invoice) {
      return {
        content: [{ type: "text", text: `No invoice found for ${args.invoiceId}` }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: `Invoice ${invoice.id}: $${invoice.amountDue} due, status=${invoice.status}` }],
      structuredContent: invoice
    };
  }
);

const financeServer = createSdkMcpServer({ name: "finance", version: "1.0.0", tools: [getInvoiceStatus] });

// --- 2. Two subagents ---
const agents: Record<string, AgentDefinition> = {
  "collections-analyst": {
    description: "Reviews overdue invoices and drafts collections plans. Use for AR aging / dunning questions.",
    prompt: "You are an AR collections analyst. Always call get_invoice_status before making claims about an invoice. Cite invoice IDs.",
    tools: ["mcp__finance__get_invoice_status"],
    model: "sonnet"
  },
  "contract-reviewer": {
    description: "Reads contract text and extracts payment terms, discounts, and non-standard clauses.",
    prompt: "You are a contract analyst. Extract payment terms and discount clauses. Quote the exact clause text you relied on.",
    tools: ["Read", "Grep"],
    model: "sonnet"
  }
};

// --- 3. Orchestrator query ---
async function main() {
  try {
    for await (const message of query({
      prompt: "Check invoice INV-10234's status, and if overdue, draft a collections email referencing any discount clause in contracts/acme.txt",
      options: {
        agents,
        mcpServers: { finance: financeServer },
        allowedTools: ["Agent", "Read", "Grep", "mcp__finance__get_invoice_status"],
        maxTurns: 15
      }
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use" && (block.name === "Agent" || block.name === "Task")) {
            console.log(`[orchestrator] delegating -> ${block.input.subagent_type}`);
          }
        }
      }
      if (message.type === "result") {
        if (message.subtype === "success") console.log(message.result);
        console.log(`cost: $${message.total_cost_usd}`);
      }
    }
  } catch (error) {
    console.error(`Session ended with an error: ${error}`);
  }
}

async function lookupInvoiceInDb(id: string) {
  return { id, amountDue: 12500, status: "overdue" }; // stub — replace with real DB call
}

main();
```

**Sources (A):** https://code.claude.com/docs/en/agent-sdk/overview , /subagents , /skills , /hooks , /mcp , /custom-tools , /sessions , /structured-outputs , /streaming-output , /streaming-vs-single-mode , /cost-tracking , /hosting , /session-storage ; https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk ; https://pypi.org/pypi/claude-agent-sdk/json ; https://github.com/anthropics/claude-agent-sdk-typescript ; https://github.com/anthropics/claude-agent-sdk-python

**Gap to flag:** the exhaustive `Options`/`SDKMessage` type reference (`https://code.claude.com/docs/en/agent-sdk/typescript`) and the GitHub changelogs were not fetched directly — the topic-specific docs above were sufficient to verify all 10 requested points, but pull that page if you need the full type list.

---

## B. Memory layers

### Graphiti (getzep/graphiti)

**Bi-temporal edges — CONFIRMED.** Every edge ("EntityEdge"/fact) carries four timestamps: `valid_at`/`invalid_at` for world-time (when the relationship became true / stopped being true) and `created_at`/`expired_at` for system-time (when Graphiti learned it, and when superseded). Both `valid_at`/`invalid_at` are optional and extracted by an LLM prompt from episode text (absolute dates like "June 20, 2022" or relative ones like "2 years ago"). On conflict, Graphiti invalidates rather than deletes, preserving history for point-in-time queries. Sources: https://help.getzep.com/graphiti/getting-started/welcome , https://arxiv.org/html/2501.13956v1 (Zep temporal KG paper), corroborated by production bug threads referencing these exact field names (https://github.com/getzep/graphiti/issues/893, #1489).

**Graph DB backends — CONFIRMED.** Neo4j 5.26+ (default) and FalkorDB 1.1.2+ are the two backends the docs recommend for new projects. Amazon Neptune (Database Cluster or Neptune Analytics, requires Amazon OpenSearch Serverless too) is also supported via `graphiti-core[neptune]`. Kuzu 0.11.2 is supported but **deprecated** — upstream Kuzu is unmaintained; the driver still ships but throws `DeprecationWarning` and will be removed. Sources: https://github.com/getzep/graphiti/blob/main/README.md , https://help.getzep.com/graphiti/getting-started/quick-start

**LLM providers — CONFIRMED, Anthropic included.** OpenAI (default), Azure OpenAI, Google Gemini, Anthropic, Groq, and OpenAI-compatible endpoints (Ollama, DeepSeek, Together, etc.). Anthropic requires the `graphiti-core[anthropic]` extra, configured via `LLMConfig`. Docs explicitly note: "Graphiti works best with LLM services that support Structured Output (such as OpenAI, Anthropic, and Gemini)." Source: https://help.getzep.com/graphiti/getting-started/quick-start

**MCP server — CONFIRMED.** Official server lives at `/mcp_server/` in the getzep/graphiti repo, documented at https://help.getzep.com/graphiti/getting-started/mcp-server — exposes episode ingestion, entity/relationship ops, and semantic search as MCP tools; the docs specifically call out Claude Desktop, Cursor, and VS Code+Copilot as clients.

**TypeScript client — Python-only for the OSS core (important gotcha).** `graphiti-core` has no JS/TS client. The only official TS package in this ecosystem is `@getzep/zep-cloud`, which talks to **Zep Cloud** — a separate hosted commercial product built on Graphiti, not the same as self-hosting graphiti-core. (Unrelated namespace collision to watch for: a JS ORM also called "Graphiti"/Spraypaint exists at graphiti.dev/js — don't confuse it with getzep/graphiti.)

**Setup time estimate:** Docker Compose brings up Neo4j or FalkorDB in one command; `pip install graphiti-core[anthropic]`; set API key + `SEMAPHORE_LIMIT`; run the `/examples/quickstart/` script. For a team that has never touched it, realistically **2–4 hours** to first ingestion+query working — plus non-trivial extra time to bridge it into a Next.js app (subprocess, HTTP microservice, or MCP client), since it's Python-only.

### Mem0
Source: https://github.com/mem0ai/mem0 , https://docs.mem0.ai/core-concepts/memory-types

Flat-ish semantic memory, not a graph. `memory.add(messages, user_id=...)` extracts memories from conversation; `memory.search(query, filters={"user_id":...}, top_k=N)` retrieves via hybrid semantic+BM25+entity matching. Scoping is via four flat identifiers — `user_id`, `agent_id`, `run_id`, `app_id` (Platform only) — at least one required. No graph structure, no scope-condition language, no notion of "applies only when X." A "Temporal Reasoning" feature ranks dated instances but there is **no expiration/TTL/temporal-validity mechanism documented**. TS SDK exists but is more limited than the Python OSS package (e.g. procedural memory unavailable on the TS SDK). **Does not fit "precedent with guardrails" out of the box** — the scope-matching/guardrail logic would be entirely bespoke on top of generic filtered vector recall.

### Letta (formerly MemGPT)
Source: https://docs.letta.com/guides/core-concepts/memory/memory-blocks , https://docs.letta.com/guides/core-concepts/memory/archival-memory

Stateful-agent memory: **core memory blocks** (labeled, editable, pinned-to-context text segments, e.g. `human`/`persona`/custom labels, shareable across agents) + **archival memory** (semantically searchable long-term store, queried on demand, not graph-structured). No built-in scope-condition or anti-generalization mechanism — a block's "scope" is whatever the agent infers from its description field, the opposite of a hard guardrail. Better suited to single-agent persistent personality/state than a cross-cutting enterprise precedent graph queried by multiple pipeline stages.

### Recommendation: hand-roll a bi-temporal graph in Postgres, modeled on Graphiti's edge schema

For an 18-hour TS/Next.js/Vercel build: **don't adopt Graphiti, Mem0, or Letta as infrastructure — borrow Graphiti's schema idea and implement it directly in Postgres** (Vercel Postgres/Neon + Drizzle/Prisma).

1. **The actual differentiator — the guardrail — isn't provided by any of the three.** Mem0 and Letta have no scope-condition concept at all; Graphiti has temporal edges but no "refuse to auto-apply outside this exact scope" logic either. That logic is bespoke business code regardless of backend, so pick the backend that minimizes friction, not one that maximizes borrowed features you won't use.
2. **Stack fit.** Graphiti's core is Python-only; bridging it into Next.js costs hours (subprocess/HTTP microservice, or speaking MCP from Node) on top of the 2–4hr setup estimate above. Mem0/Letta avoid that friction but buy nothing structural in return.
3. **Table design**: `precedents(id, resolution_text, scope_conditions jsonb, source_ref, resolved_by, valid_at, invalid_at, created_at, expired_at)` + a join table to scoped entities (customer/contract/invoice-type) — directly mirrors Graphiti's bi-temporal fields, so the team can honestly say "we implemented a bi-temporal context-graph schema" without the runtime/integration cost.
4. **Demo control.** A Postgres table the team owns is trivially rendered as a force-directed graph (e.g. `react-force-graph`) with full control over what's highlighted live during judging — safer than depending on Neo4j Bloom or an undocumented default UI.
5. **Stretch goal, not day-1 dependency**: if core flow finishes early, wiring the real Graphiti MCP server in as an *additional* "we know the frontier tools" talking point is low-risk since it's additive, not load-bearing.

**Sources (B):** https://github.com/getzep/graphiti , https://help.getzep.com/graphiti/getting-started/{welcome,quick-start,mcp-server} , https://arxiv.org/html/2501.13956v1 , https://github.com/mem0ai/mem0 , https://docs.mem0.ai , https://docs.letta.com/guides/core-concepts/memory/{memory-blocks,archival-memory}

---

## C. Context graphs (source essays)

### Foundation Capital — "AI's trillion-dollar opportunity: Context graphs"
URL: https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity

- **Author**: no byline was visible in the directly-fetched page content (attributed only to "Foundation Capital"). Secondary sources attribute it to General Partners **Jaya Gupta and Ashu Garg** — **unverified directly against the primary page** (byline may render client-side).
- **Publish date — unverified/conflicting.** Fetched page metadata showed Sep 17, 2026, but a secondary search snippet said December 2025, and Foundation Capital has a separate follow-up post, "Context graphs, one month in" (https://foundationcapital.com/context-graphs-one-month-in/), implying the original ran roughly a month before that. The Sep 17 timestamp may be a last-modified date rather than original publish date — cite the essay without a hard date, or spot-check the visible byline/date yourselves.

**Key claims:**
1. Decision traces — captured exceptions, overrides, and cross-system context — are a missing data layer today; they live informally in Slack threads and deal-desk conversations, never in a system of record.
2. Agentic "systems of agent" startups have a structural advantage over incumbents because they sit in the execution path and can capture decision context at the moment decisions are actually made.
3. A context graph — a queryable record of decision traces stitched across entities and time — becomes the real source of truth for autonomous systems; precedent becomes searchable.
4. Incumbent enterprise software structurally cannot capture decision traces well: it's either locked to current-state-only data models, or sits only in read paths after a decision has already been made.
5. Three viable startup paths: (a) replace an entire system of record, (b) replace a specific module of one, or (c) build an entirely new system of record centered on decision lineage rather than current state.
6. "Glue functions" (RevOps/DevOps/SecurityOps-style roles that stitch together multiple systems) are cited as signals pointing to where new system-of-record opportunities exist.
7. The framing contrasts this with the prior enterprise-software generation (Salesforce/Workday/SAP as systems of record for customers/employees/operations).

**Direct quotes** (extracted via fetch; treat as high-confidence but recommend a manual spot-check before publishing verbatim in a deck):
- "Captured decision traces become searchable precedent" (~5 words)
- "They inherit their parent's architectural limitations" (~6 words)
- "Capturing decision traces requires being in the execution path" (~9 words)
- "the exceptions, overrides, precedents, and cross-system context" (~7 words; truncated from a longer sentence to stay under 15 words)

### Neo4j — "Hands on with context graphs and Neo4j"
URL: https://neo4j.com/blog/agentic-ai/hands-on-with-context-graphs-and-neo4j/ (cross-posted: https://medium.com/neo4j/hands-on-with-context-graphs-and-neo4j-8b4b8fdc16dd)
Author: **William Lyon**. Published: **January 14, 2026**.

**Proposed schema for decision traces**, split into two categories:
- *Entities (what exists)*: `Person` (customers/employees), `Account` (checking/savings/trading/margin), `Transaction` (deposits/withdrawals/transfers), `Organization` (banks/vendors/counterparties), `Policy` (business rules/thresholds).
- *Decision traces (what happened and why)*: `Decision` (core event with full reasoning), `DecisionContext` (state snapshot at decision time), `Exception` (policy overrides with justification), `Escalation` (decisions requiring higher authority), `Community` (clusters of related decisions).

**Relationships**: causal (`:CAUSED`, `:INFLUENCED`, `:PRECEDENT_FOR`), context (`:ABOUT`, `:APPLIED_POLICY`, `:GRANTED_EXCEPTION`, `:TRIGGERED`), entity (`:OWNS`, `:FROM_ACCOUNT`, `:TO_ACCOUNT`).

**Example repo — directly relevant to this team's stack**: https://github.com/johnymontana/context-graph-demo, described in-article as open source. Verified directly: it demonstrates context graphs with Neo4j "for AI-powered decision tracing in financial institutions" across three scenarios (credit decisions with precedent lookup, fraud-pattern detection via graph analysis, exception requests with audit trails). Stack: Python 3.11+/FastAPI backend, **Next.js + Chakra UI v3 + TypeScript frontend**, Neo4j with Graph Data Science + vector search + NVL visualization, **Claude Agent SDK** as the agent runtime, OpenAI API for embeddings, `uv` package manager. This is close to a reference implementation of exactly this team's stack combination (Claude Agent SDK + Neo4j-style context graph + Next.js/TS) — worth cloning and reading before building from scratch. Minor discrepancy: the article says "11 specialized MCP tools," the repo README lists 10 (`search_customer`, `get_customer_decisions`, `find_similar_decisions`, `find_precedents`, `get_causal_chain`, `record_decision`, `detect_fraud_patterns`, `get_policy`, `execute_cypher`, `get_schema`) — cite "10–11."

**Sources (C):** https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity , https://foundationcapital.com/context-graphs-one-month-in/ , https://neo4j.com/blog/agentic-ai/hands-on-with-context-graphs-and-neo4j/ , https://github.com/johnymontana/context-graph-demo

---

## D. Self-improvement tooling: DSPy + GEPA

### 1. Is `dspy.GEPA` available? Version?
Confirmed — `dspy.GEPA` is a documented, shipping optimizer.
- Current DSPy on PyPI: **3.3.1**, released 2026-08-21. Source: https://pypi.org/project/dspy/
- GEPA was added in DSPy **3.0.0** and refined through 3.0.4/3.1.0/3.2.0+ (custom component selection, MLflow integration). Source: https://github.com/stanfordnlp/dspy/releases
- Import path: `dspy.GEPA`. Docs: https://dspy.ai/current/api/optimizers/GEPA/overview/
- Underlying paper: "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning" (Agrawal et al., arXiv:2507.19457, July 2025) — a genuinely recent technique.
- Tutorials: https://dspy.ai/tutorials/gepa_ai_program/ , /gepa_facilitysupportanalyzer/ , /gepa_papillon/ ; advanced config: https://dspy.ai/current/api/optimizers/GEPA/GEPA_Advanced/

### 2. What GEPA needs / minimum viable setup
```python
dspy.GEPA(
    metric: GEPAFeedbackMetric,                 # required — must return rich textual feedback, not just a score
    auto: Literal['light','medium','heavy'] | None = None,   # or max_full_evals / max_metric_calls
    reflection_lm: LM | None = None,             # a separate, typically stronger LM for critiquing traces
    reflection_minibatch_size: int = 3,
    candidate_selection_strategy: 'pareto' | 'current_best' = 'pareto',
    track_stats: bool = False, use_wandb: bool = False, seed: int | None = 0,
    # + more optional knobs
)
optimized_program = optimizer.compile(student_module, trainset=train, valset=val)
```
Minimum viable inputs: a DSPy `Module`/program, a `trainset` (+ ideally a `valset`), a metric function that emits textual feedback, and a **second, strong LM** dedicated to reflection. **DSPy's `dspy.LM` supports Anthropic/Claude natively via LiteLLM** — a single instance can target OpenAI, Anthropic, Gemini, Vertex AI, Databricks, or local models — so `reflection_lm` can be a Claude model string, fitting this team's existing Anthropic stack. **Unverified**: the exact metric-call budget each `auto` preset (light/medium/heavy) maps to — referenced but not disclosed in what was extracted from the advanced-config doc.

### 3. Typical cost/time for a small run
- General DSPy guidance (applies across optimizers, not GEPA-specific): "a typical simple optimization run costs on the order of $2 USD and takes around ten minutes"; full range "a few cents ... to tens of dollars, depending on your LM, dataset, and configuration." Source: https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md
- Concrete GEPA example (Facility Support Analyzer tutorial): trainset=66, valset=66, test=68; ~1,643 metric calls (~12.45 full evals) under the default budget; task model GPT-4.1 nano, reflection model GPT-5; validation score moved 72.1% → 86.1% (test baseline 75.4%). Source: https://dspy.ai/tutorials/gepa_facilitysupportanalyzer/. A wall-clock estimate (~8 min) was inferred from log timestamps, not an explicit stated duration — directional only.
- Takeaway: a realistic GEPA run wants **dozens of labeled examples** (this example used 132 train+val), a second frontier-tier LM, and low-single-digit to tens-of-dollars of spend per run — **not** a fit for a live "corrections arriving one at a time" demo.

### 4. Lighter alternatives + recommendation
From https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md:
- **BootstrapFewShot** — "if you have very few examples (around 10), start with BootstrapFewShot." Generates demos via a teacher module; no reflection LM needed. Cheapest, simplest DSPy optimizer.
- **BootstrapFewShotWithRandomSearch** — for "50 examples or more."
- **MIPROv2** — needs "200 examples or more to prevent overfitting" and "40 trials or more." Too data-hungry for corrections trickling in live.
- **GEPA** — most sample-efficient of the frontier-grade optimizers by design, but still used 132 examples + a strong second LM in the official example above.

**Recommendation for an 18-hour build:** a live demo where corrections arrive one at a time is a poor fit for any batch-compile optimizer — you won't have 50–200 examples before you need to show improvement. (This recommendation is the team's own synthesis, not a documented DSPy pattern.)
1. **Primary path — hand-rolled incremental few-shot memory, no framework.** Store each human correction as a labeled example the moment it happens. At inference time, retrieve the k most relevant past corrections (embedding similarity or scope/keyword match) and inject them as few-shot demonstrations + a one-line natural-language "lesson." Re-run a small fixed held-out eval set after every new correction and log the score — that log *is* your improvement-curve chart. This mirrors DSPy's own `LabeledFewShot`/`BootstrapFewShot` idea done manually, without needing 10+ examples, a reflection LM, or a multi-minute compile job — and it updates instantly, safe to demo live.
2. **Stretch/frontier-cred path** if time remains: once ~10–70 corrections have accumulated, run them once through real `dspy.GEPA` with `auto="light"` and a Claude model as `reflection_lm` as a bonus artifact showing a genuinely optimized prompt — useful if judges probe technical depth. Keep it off the critical demo path given the documented ~$2-and-up, ~10-minute-plus cost profile.

**Sources (D):** https://pypi.org/project/dspy/ , https://github.com/stanfordnlp/dspy/releases , https://dspy.ai/current/api/optimizers/GEPA/overview/ , https://dspy.ai/current/getting-started/gepa-optimization/ , https://dspy.ai/current/api/optimizers/GEPA/GEPA_Advanced/ , https://dspy.ai/tutorials/gepa_facilitysupportanalyzer/ , https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md , https://docs.litellm.ai/docs/providers/anthropic , arXiv:2507.19457

---

## E. Datasets

| Dataset | URL | Size | License | Download friction |
|---|---|---|---|---|
| BenchRec (cash reconciliation) | https://www.kaggle.com/datasets/benchmarkteam/benchrec-real-world-cash-reconciliation-dataset | Obfuscated Tier-1-bank GL↔bank transaction pairs; exact row count **unverified** (Kaggle page is JS-rendered, blocked automated fetch) | **unverified** | Kaggle account (free); no approval step found, but not independently confirmed |
| Invoice Sandbox Benchmark (ciru-ai) | https://github.com/ciru-ai/invoice-sandbox-benchmark | 110 synthetic invoice PDFs + email/.eml/.mbox archives, bank CSVs, CRM/ops files; exact non-PDF counts not disclosed | **unverified** (no LICENSE found in fetched content — check repo directly) | Public GitHub repo, clone freely |
| DABstep (Adyen) | https://huggingface.co/datasets/adyen/DABstep (leaderboard: https://huggingface.co/spaces/adyen/DABstep; paper: https://arxiv.org/abs/2506.23719) | 450+ real tasks (450 default + 10 dev split) drawn from Adyen's actual analytics platform; 5.9GB total per HF viewer | **CC-BY-4.0** (confirmed) | Fully open, no gating |
| APEX-Accounting (Mercor + Ramp) | Paper: https://arxiv.org/abs/2607.27189; public dev set cited in-paper at https://huggingface.co/datasets/mercor/apex-accounting (**not independently loaded/confirmed**) | Private eval = 160 tasks / 10 "worlds" (accounting system + spreadsheets/PDFs); public dev set size unstated | **unverified** | Private eval held out ("on request" only); dev set purportedly open |
| AccountingBench | Two distinct things share this name: (a) WU Vienna academic benchmark, https://research.wu.ac.at/en/activities/accountingbench-a-structured-benchmark-for-systematic-evaluation-/ ; (b) Penrose's "Can LLMs Do Accounting?", https://accounting.penrose.com/ (simulated 12-month close) | Both: task-count/openness **unverified** — Penrose's page didn't render enough content to confirm a public dataset/repo | **unverified** | Likely proprietary to Penrose's product; **not confirmed public** — do not assume downloadable |
| Finance Agent Benchmark (Vals AI) | Leaderboard: https://www.vals.ai/benchmarks/fabv2; data: https://huggingface.co/datasets/vals-ai/finance_agent_benchmark; paper: https://arxiv.org/abs/2508.00828 | v1.1 = 537 expert questions, v2 = 927 (public/private-val/held-out-test split); HF viewer exposes only a **50-row public sample** | **CC-BY-4.0** (confirmed) | Open/ungated, but the full answer key is held out — only the 50-question sample is usable pre-answers |
| IBM Finance Factoring — Late Payment Histories | https://www.kaggle.com/datasets/hhenry/finance-factoring-ibm-late-payment-histories | ~2,466 invoices per secondary sources (page itself didn't render for automated fetch) | **unverified** | Kaggle account (free); not independently confirmed |
| Payment Date Prediction on Open Invoices | https://www.kaggle.com/datasets/pradumn203/payment-date-prediction-for-invoices-dataset | **unverified** (published ~Feb 2023 per search snippet; page didn't render) | **unverified** | Kaggle account (free), not independently confirmed |
| Remittance / cash-application (payment-to-invoice matching) | — | **None found publicly.** Search surfaced only vendor blog posts (Serrala, StackOne, Monk, Itemize, ChatFin, BlueCopa) describing the problem, no dataset | n/a | Synthesize this yourselves; BenchRec is the closest public analog (bank↔ledger, not payment↔invoice) |
| CUAD (Contract Understanding Atticus Dataset) | https://huggingface.co/datasets/theatticusproject/cuad (mirrors: https://www.atticusprojectai.org/cuad, https://zenodo.org/records/4595826) | 510 commercial contracts, 13,000+ manually labeled clauses across 41 categories; HF default split = 84,325 rows (SQuAD-style), 159MB total; also ships 28 Excel files, 510 PDFs, 510 TXT | **CC BY 4.0** (confirmed) | Fully open, no gating — **best free-ground-truth option in this section** |
| Enron email corpus | Canonical: http://www.cs.cmu.edu/~enron/; common mirrors on Kaggle/HF | ~500,000 messages, ~150 mailboxes, latest release May 7 2015, ~1.7GB tar.gz | No formal reuse license; released into the public record by FERC (2003) after its Enron/Western-energy-crisis investigation; CMU distributes it "as a resource for researchers" for historical/academic use and asks users to respect personal privacy. Some integrity/authenticity caveats exist for parts of the corpus — worth a light pass before treating it as "clean" ground truth. | Open, no approval wait |

Also noted in passing (not deeply vetted): **FinBalance** (arXiv 2606.15949) — a multi-document accounting reconciliation benchmark, a potential public-data alternative/complement to BenchRec — worth a 10-minute look if reconciliation is a demo centerpiece.

**Sources (E):** see URLs in table above.

---

## Sources index (primary, by section)
- A: https://code.claude.com/docs/en/agent-sdk/{overview,subagents,skills,hooks,custom-tools,mcp,sessions,structured-outputs,streaming-output,cost-tracking,hosting}, https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk, https://pypi.org/pypi/claude-agent-sdk/json
- B: https://github.com/getzep/graphiti, https://help.getzep.com/graphiti/getting-started/{welcome,quick-start,mcp-server}, https://github.com/mem0ai/mem0, https://docs.mem0.ai, https://docs.letta.com/guides/core-concepts/memory/{memory-blocks,archival-memory}
- C: https://foundationcapital.com/ideas/context-graphs-ais-trillion-dollar-opportunity, https://neo4j.com/blog/agentic-ai/hands-on-with-context-graphs-and-neo4j/, https://github.com/johnymontana/context-graph-demo
- D: https://dspy.ai/current/api/optimizers/GEPA/overview/, https://github.com/stanfordnlp/dspy, https://arxiv.org/abs/2507.19457, https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md
- E: see table above for per-dataset URLs.
