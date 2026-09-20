import { CONTROLLER_PROMPT, ControllerVerdict, type Controller, type ReviewPacket } from "./controller.js";

export interface OpenAIControllerOptions {
  /** Set FOOTNOTE_CONTROLLER_MODEL, or pass a model id. A different family from the preparer is the point. */
  model?: string;
  id?: string;
}

/** The controller on an OpenAI model. One structured call per review; an unparsable reply counts as "does not agree". */
export function openAIController(opts: OpenAIControllerOptions = {}): Controller {
  const model = opts.model ?? process.env.FOOTNOTE_CONTROLLER_MODEL ?? "gpt-5";
  const id = opts.id ?? "controller:gpt";
  return {
    id,
    async review(packet: ReviewPacket): Promise<ControllerVerdict> {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set; the controller agent cannot run");
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI();
      const completion = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CONTROLLER_PROMPT },
          { role: "user", content: JSON.stringify({ proposal: packet.proposal, kernel_marks: packet.marks, sources: packet.sources }) },
        ],
      });
      const text = completion.choices[0]?.message?.content ?? "";
      return parseVerdict(text);
    },
  };
}

export function parseVerdict(text: string): ControllerVerdict {
  try {
    const parsed = ControllerVerdict.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through: an unreadable reply is not an agreement
  }
  return { agrees: false, note: "The controller's reply could not be read, so it does not count as agreement.", concerns: ["unparsable reply"] };
}
