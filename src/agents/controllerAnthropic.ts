import { CONTROLLER_PROMPT, ControllerVerdict, type Controller, type ReviewPacket, type ReviewUsage } from "./controller.js";

export interface AnthropicControllerOptions {
  /** Defaults to Claude Opus 5, a different model from the Sonnet and Haiku preparers. */
  model?: string;
  id?: string;
}

const DISAGREE = (note: string, concern: string): ControllerVerdict => ({ agrees: false, note, concerns: [concern] });

/**
 * The controller on a Claude model, for when only an Anthropic key is available. It is a different model and a
 * fresh context from the preparer, but the same model family: weaker independence than a GPT controller, and the
 * README should say so. Structured output, so the reply is a verdict or nothing. Anything else fails closed.
 */
export function anthropicController(opts: AnthropicControllerOptions = {}): Controller {
  const model = opts.model ?? process.env.FOOTNOTE_CONTROLLER_MODEL ?? "claude-opus-5";
  return {
    id: opts.id ?? "controller:claude",
    async review(packet: ReviewPacket): Promise<ControllerVerdict & { usage?: ReviewUsage }> {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
      const client = new Anthropic();
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: CONTROLLER_PROMPT,
        output_config: { effort: "medium", format: zodOutputFormat(ControllerVerdict) },
        messages: [{ role: "user", content: JSON.stringify({ proposal: packet.proposal, kernel_marks: packet.marks, sources: packet.sources }) }],
      });
      if (response.stop_reason === "refusal") return DISAGREE("The reviewing model declined to review this entry, so it goes to a person.", "model refusal");
      if (response.stop_reason === "max_tokens") return DISAGREE("The review was cut off before a verdict, so it does not count as agreement.", "truncated reply");
      const verdict = response.parsed_output ?? DISAGREE("The controller's reply could not be read, so it does not count as agreement.", "unparsable reply");
      return { ...verdict, usage: { tokens_in: response.usage.input_tokens, tokens_out: response.usage.output_tokens } };
    },
  };
}
