import type { LlmProvider, LlmRequest } from "./provider";

const API_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model: string
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    if (!this.apiKey) {
      throw new Error("No API key configured. Add your Anthropic API key in Settings.");
    }
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 2000,
        system: req.system,
        messages: req.messages
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
}
