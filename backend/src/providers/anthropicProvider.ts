import { ChatMessage, ChatOptions, ChatProvider, ModelInfo, StreamChunk } from "./base";
import { iterateSseLines } from "./sseUtil";
import { env } from "../config/env";

const ANTHROPIC_VERSION = "2023-06-01";

function toAnthropicMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.images && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...m.images.map((img) => {
              const match = img.match(/^data:(.+);base64,(.+)$/);
              return match
                ? {
                    type: "image",
                    source: { type: "base64", media_type: match[1], data: match[2] },
                  }
                : { type: "text", text: "[unsupported image format]" };
            }),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });
}

export const anthropicProvider: ChatProvider = {
  id: "anthropic",
  label: "Anthropic",
  requiresApiKey: true,

  async listModels(): Promise<ModelInfo[]> {
    // Anthropic has no public "list models" endpoint that works uniformly across all key
    // types, so we ship a maintained static catalog. Users can still type a custom model id
    // in Settings if a newer model isn't listed yet.
    return [
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", supportsImages: true, contextWindow: 200000 },
      { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1", supportsImages: true, contextWindow: 200000 },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", supportsImages: true, contextWindow: 200000 },
    ];
  },

  async *streamChat(messages, apiKey, options: ChatOptions): AsyncGenerator<StreamChunk> {
    if (!apiKey) {
      yield { type: "error", message: "No Anthropic API key configured for this account." };
      return;
    }
    const systemPrompt = messages.find((m) => m.role === "system")?.content ?? undefined;

    let res: Response;
    try {
      res = await fetch(`${env.anthropicBaseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: options.model,
          system: systemPrompt,
          messages: toAnthropicMessages(messages),
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
          stream: true,
        }),
        signal: options.signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Failed to reach Anthropic API: ${err.message}` };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Provider error (${res.status}): ${text.slice(0, 500)}` };
      return;
    }

    try {
      for await (const raw of iterateSseLines(res.body as any)) {
        try {
          const json = JSON.parse(raw);
          if (json.type === "content_block_delta" && json.delta?.text) {
            yield { type: "token", text: json.delta.text };
          } else if (json.type === "message_stop") {
            break;
          } else if (json.type === "error") {
            yield { type: "error", message: json.error?.message ?? "Anthropic stream error" };
            return;
          }
        } catch {
          // ignore non-JSON event lines (e.g. "event: content_block_delta")
        }
      }
      yield { type: "done" };
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Stream interrupted: ${err.message}` };
    }
  },
};
