import { ChatMessage, ChatOptions, ChatProvider, ModelInfo, ProviderError, StreamChunk } from "./base";
import { iterateSseLines } from "./sseUtil";
import { env } from "../config/env";

/**
 * Works with OpenAI itself and any OpenAI-compatible /v1/chat/completions endpoint
 * (Groq, Together.ai, OpenRouter, Fireworks, self-hosted vLLM/text-generation-inference, etc).
 * Point OPENAI_BASE_URL at the compatible endpoint to use one of those instead of OpenAI.
 */
function toOpenAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          ...m.images.map((img) => ({ type: "image_url", image_url: { url: img } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export const openaiProvider: ChatProvider = {
  id: "openai",
  label: "OpenAI (or compatible)",
  requiresApiKey: true,

  async listModels(apiKey: string | null): Promise<ModelInfo[]> {
    // A curated static list keeps the UI responsive and works even before a key is verified;
    // if a key is present we still try a live fetch and merge in anything new.
    const fallback: ModelInfo[] = [
      { id: "gpt-4o", label: "GPT-4o", supportsImages: true, contextWindow: 128000 },
      { id: "gpt-4o-mini", label: "GPT-4o mini", supportsImages: true, contextWindow: 128000 },
      { id: "o1", label: "o1 (reasoning)", supportsImages: true, contextWindow: 200000 },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", supportsImages: true, contextWindow: 128000 },
    ];
    if (!apiKey) return fallback;
    try {
      const res = await fetch(`${env.openaiBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { data?: { id: string }[] };
      const chatLike = (data.data ?? [])
        .map((m) => m.id)
        .filter((id) => /gpt|o1|o3|chat|mixtral|llama/i.test(id));
      if (chatLike.length === 0) return fallback;
      return chatLike.slice(0, 40).map((id) => ({
        id,
        label: id,
        supportsImages: /gpt-4o|vision|o1/i.test(id),
      }));
    } catch {
      return fallback;
    }
  },

  async *streamChat(messages, apiKey, options: ChatOptions): AsyncGenerator<StreamChunk> {
    if (!apiKey) {
      yield { type: "error", message: "No OpenAI API key configured for this account." };
      return;
    }
    let res: Response;
    try {
      res = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: toOpenAiMessages(messages),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: true,
        }),
        signal: options.signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Failed to reach OpenAI-compatible endpoint: ${err.message}` };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Provider error (${res.status}): ${text.slice(0, 500)}` };
      return;
    }

    try {
      for await (const raw of iterateSseLines(res.body as any)) {
        if (raw === "[DONE]") break;
        try {
          const json = JSON.parse(raw);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield { type: "token", text: delta };
        } catch {
          // ignore malformed keep-alive lines
        }
      }
      yield { type: "done" };
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Stream interrupted: ${err.message}` };
    }
  },
};
