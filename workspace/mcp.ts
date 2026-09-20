import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { flagString, parseArgs } from "../src/cli/flags.js";
import { openDb, type Db } from "../src/runtime/db.js";
import { forReading } from "./ask.js";
import { TOOLS, type BookTool, type ToolResult } from "./tools.js";

const USAGE = "usage: pnpm mcp <db> [--period YYYY-MM]";

/**
 * The books over the Model Context Protocol: the same ten read-only tools the Ask page uses, for any MCP client
 * (Claude Desktop, Claude Code, an IDE). Nothing here can post, approve or answer: those stay with a person in the
 * workspace. Amounts are written out by code, so a client model copies them and never converts cents.
 */
export function buildMcpServer(db: Db, period: string): McpServer {
  const server = new McpServer({ name: "money-maxer-books", version: "0.1.0" });
  for (const tool of TOOLS as readonly BookTool[]) {
    server.registerTool(tool.name, {
      title: tool.title, description: `${tool.description} Read-only. Example question: "${tool.example}"`, inputSchema: tool.input,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, (input: unknown) => {
      try {
        return { content: [{ type: "text" as const, text: render(tool.run({ db, period }, input as never)) }] };
      } catch (err) {
        // The message only: a stack trace is no use to a client and may name paths on this machine.
        return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : "the tool failed" }] };
      }
    });
  }
  return server;
}

/** A tool's result as text a model can read and quote: the sentence, then one line per row, then where it came from. */
function render(result: ToolResult): string {
  const rows = forReading(result).map((row) => Object.entries(row).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" | "));
  return [result.title, result.summary, ...rows, `Computed by code from: ${result.source}`].join("\n");
}

/** The month being closed: the month of the latest bank line, unless one is named. */
export function latestPeriod(db: Db): string {
  const row = db.prepare("SELECT MAX(posted_date) AS d FROM bank_txn").get() as { d: string | null };
  return (row.d ?? new Date().toISOString()).slice(0, 7);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.positional[0];
  if (!dbPath || !existsSync(dbPath)) {
    process.stderr.write(`${dbPath ? `no database at ${dbPath}` : USAGE}\n`);
    process.exit(1);
  }
  const period = flagString(args, "period");
  if (period !== undefined && !/^\d{4}-\d{2}$/.test(period)) {
    process.stderr.write("--period must be YYYY-MM\n");
    process.exit(1);
  }
  const db = openDb(dbPath);
  // stdout belongs to the protocol. Anything a person should read goes to stderr.
  process.stderr.write(`money-maxer-books: ${TOOLS.length} read-only tools over ${dbPath}, period ${period ?? latestPeriod(db)}\n`);
  await buildMcpServer(db, period ?? latestPeriod(db)).connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
