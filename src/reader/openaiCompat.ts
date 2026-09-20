import { READ_INSTRUCTION, type DocumentReader, type ReadOutcome } from "./types.js";

export interface OpenAICompatReaderOptions {
  /** Base URL of an OpenAI-compatible server, e.g. http://gx10.local:8000/v1 (ft/serve.py, vLLM, Ollama). */
  base_url: string;
  model: string;
  name: string;
  api_key?: string;
  max_seconds?: number;
  max_tokens?: number;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * A document reader on any OpenAI-compatible chat endpoint. One request per document, no tools, a hard time limit.
 * A refusal, a timeout, a non-200, or a reply that is not JSON all come back as `ok: false` with the reason.
 */
export function openAICompatReader(opts: OpenAICompatReaderOptions): DocumentReader {
  const url = `${opts.base_url.replace(/\/+$/, "")}/chat/completions`;
  return {
    name: opts.name,
    async read(documentText: string): Promise<ReadOutcome> {
      const started = Date.now();
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), (opts.max_seconds ?? 30) * 1000);
      try {
        const res = await fetch(url, {
          method: "POST", signal: abort.signal,
          headers: { "content-type": "application/json", ...(opts.api_key ? { authorization: `Bearer ${opts.api_key}` } : {}) },
          body: JSON.stringify({ model: opts.model, temperature: 0, max_tokens: opts.max_tokens ?? 512,
            messages: [{ role: "user", content: `${READ_INSTRUCTION}\n\n${documentText}` }] }),
        });
        if (!res.ok) return { ok: false, reason: `reader endpoint answered ${res.status}`, latency_ms: Date.now() - started };
        return toOutcome((await res.json()) as ChatResponse, Date.now() - started);
      } catch (err) {
        const reason = abort.signal.aborted ? `no reply within ${opts.max_seconds ?? 30} seconds` : `reader unreachable: ${err instanceof Error ? err.message : String(err)}`;
        return { ok: false, reason, latency_ms: Date.now() - started };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function toOutcome(body: ChatResponse, latencyMs: number): ReadOutcome {
  const text = body.choices?.[0]?.message?.content ?? "";
  const doc = parseJsonReply(text);
  if (doc === undefined) return { ok: false, reason: "the reply is not JSON", latency_ms: latencyMs, raw: text.slice(0, 400) };
  return { ok: true, doc, latency_ms: latencyMs, tokens_in: body.usage?.prompt_tokens, tokens_out: body.usage?.completion_tokens };
}

/** Models wrap JSON in code fences or a sentence. Take the outermost object; anything else is not an answer. */
export function parseJsonReply(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    // Not JSON after all: the caller reports it as an unreadable reply.
    return undefined;
  }
}

/**
 * One variable switches the reader on: FT_ENDPOINT_URL, as lane C's interface note says (ft/INTERFACE.md), or
 * FOOTNOTE_READER_URL. Its server ignores the model field, so the model and display names are optional. Lane C's
 * rule is that anything slower than 30 seconds goes to the next tier.
 */
export function readerFromEnv(env: NodeJS.ProcessEnv = process.env): DocumentReader | undefined {
  const base = env.FOOTNOTE_READER_URL ?? env.FT_ENDPOINT_URL;
  if (!base) return undefined;
  const model = env.FOOTNOTE_READER_MODEL ?? "qwen3-4b";
  return openAICompatReader({ base_url: base, model, name: env.FOOTNOTE_READER_NAME ?? model, api_key: env.FOOTNOTE_READER_KEY, max_seconds: 30 });
}
