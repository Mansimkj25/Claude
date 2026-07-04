// Thin, swappable LLM layer. Everything above this module talks to
// `LlmProvider` only, so adding another provider later means writing one
// adapter and switching here.
// TODO (post-MVP): multi-provider support (OpenAI, local models) selectable in settings.

import { AnthropicProvider } from "./anthropic";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

export interface LlmProvider {
  complete(req: LlmRequest): Promise<string>;
}

export function createProvider(apiKey: string, model: string): LlmProvider {
  return new AnthropicProvider(apiKey, model);
}
