import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { openAICompatReader, parseJsonReply, readerFromEnv } from "../openaiCompat.js";
import { READ_INSTRUCTION } from "../types.js";

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); server = undefined; }));

/** A stand-in for ft/serve.py: one chat-completions route, replying with whatever the test says. */
async function stub(reply: (body: { model: string; messages: { content: string }[] }) => { status?: number; content?: string; delay_ms?: number }): Promise<string> {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => { raw += c.toString(); });
    req.on("end", () => {
      const r = reply(JSON.parse(raw) as { model: string; messages: { content: string }[] });
      setTimeout(() => {
        res.writeHead(r.status ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: r.content ?? "" } }], usage: { prompt_tokens: 111, completion_tokens: 22 } }));
      }, r.delay_ms ?? 0);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
}

describe("document reader on an OpenAI-compatible endpoint (lane C's serve.py, vLLM, Ollama)", () => {
  it("sends the instruction the models were tuned on, and returns the JSON with its token counts", async () => {
    let seen = { model: "", content: "" };
    const base = await stub((b) => { seen = { model: b.model, content: b.messages[0]!.content }; return { content: '```json\n{"doc_kind":"remittance","amount_cents":5}\n```' }; });
    const out = await openAICompatReader({ base_url: `${base}/`, model: "qwen3-4b-ft", name: "ft" }).read("REMITTANCE ADVICE ...");
    expect(out).toMatchObject({ ok: true, doc: { doc_kind: "remittance", amount_cents: 5 }, tokens_in: 111, tokens_out: 22 });
    expect(seen.model).toBe("qwen3-4b-ft");
    expect(seen.content).toBe(`${READ_INSTRUCTION}\n\nREMITTANCE ADVICE ...`);
  });

  it("never throws: prose, a server error, a timeout and a dead endpoint all come back as a reason", async () => {
    const prose = await stub(() => ({ content: "Sure! The invoice total is 5 dollars." }));
    expect(await openAICompatReader({ base_url: prose, model: "m", name: "base" }).read("x")).toMatchObject({ ok: false, reason: "the reply is not JSON" });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    const broken = await stub(() => ({ status: 500 }));
    expect(await openAICompatReader({ base_url: broken, model: "m", name: "n" }).read("x")).toMatchObject({ ok: false, reason: "reader endpoint answered 500" });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    const slow = await stub(() => ({ content: "{}", delay_ms: 400 }));
    expect(await openAICompatReader({ base_url: slow, model: "m", name: "n", max_seconds: 0.05 }).read("x")).toMatchObject({ ok: false, reason: "no reply within 0.05 seconds" });
    const dead = await openAICompatReader({ base_url: "http://127.0.0.1:9/v1", model: "m", name: "n", max_seconds: 2 }).read("x");
    expect(dead.ok).toBe(false);
  });

  it("takes the outermost JSON object and nothing else; the environment switches the reader on", () => {
    expect(parseJsonReply('here you go {"a":{"b":1}} thanks')).toEqual({ a: { b: 1 } });
    expect(parseJsonReply("no braces")).toBeUndefined();
    expect(parseJsonReply("{not json}")).toBeUndefined();
    expect(readerFromEnv({})).toBeUndefined();
    expect(readerFromEnv({ FOOTNOTE_READER_URL: "http://gx10:8000/v1", FOOTNOTE_READER_MODEL: "qwen3-4b-ft" })?.name).toBe("qwen3-4b-ft");
    // Lane C's interface note names one variable; that alone is enough.
    expect(readerFromEnv({ FT_ENDPOINT_URL: "http://100.64.0.1:8000/v1" })?.name).toBe("qwen3-4b");
  });
});
