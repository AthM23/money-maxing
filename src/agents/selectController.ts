import type { Controller } from "./controller.js";
import { anthropicController } from "./controllerAnthropic.js";
import { openAIController } from "./controllerOpenAI.js";

/**
 * One key is enough. With an OpenAI key the controller runs on a different model family (the stronger form of
 * independence); with only an Anthropic key it runs on a different Claude model. FOOTNOTE_CONTROLLER_PROVIDER forces one.
 */
export function selectController(): Controller {
  const forced = process.env.FOOTNOTE_CONTROLLER_PROVIDER;
  if (forced === "openai" || (!forced && process.env.OPENAI_API_KEY)) return openAIController();
  return anthropicController();
}
