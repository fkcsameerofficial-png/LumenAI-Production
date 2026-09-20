import { ChatMessage, ChatOptions, ChatProvider, ModelInfo, StreamChunk } from "./base";
import { iterateSseLines } from "./sseUtil";
import { env } from "../config/env";

/**
 * Fully local/open-source models via Ollama (https://ollama.com). No API key required —
 * this is how Lumen supports running with zero cloud dependency and zero per-token cost.
 */
function toOllamaMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const base: any = { role: m.role, content: m.content };
    if (m.images && m.images.length > 0) {
      base.images = m.images.map((img) => img.replace(/^data:.+;base64,/, ""));
    }
    return base;
  });
}

export const ollamaProvider: ChatProvider = {
  id: "ollama",
  label: "Ollama (local / open-source)",
  requiresApiKey: false,

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${env.ollamaBaseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        label: m.name,
        supportsImages: /llava|vision|bakllava/i.test(m.name),
      }));
    } catch {
      // Ollama not running / not reachable — return empty rather than failing the whole app.
      return [];
    }
  },

  async *streamChat(messages, _apiKey, options: ChatOptions): AsyncGenerator<StreamChunk> {
    let res: Response;
    try {
      res = await fetch(`${env.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages: toOllamaMessages(messages),
          stream: true,
          options: { temperature: options.temperature ?? 0.7 },
        }),
        signal: options.signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield {
        type: "error",
        message: `Could not reach local Ollama server at ${env.ollamaBaseUrl}. Is it running? (${err.message})`,
      };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Ollama error (${res.status}): ${text.slice(0, 500)}` };
      return;
    }

    try {
      for await (const raw of iterateSseLines(res.body as any)) {
        try {
          const json = JSON.parse(raw);
          if (json.message?.content) yield { type: "token", text: json.message.content };
          if (json.done) break;
        } catch {
          // ignore malformed line
        }
      }
      yield { type: "done" };
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Stream interrupted: ${err.message}` };
    }
  },
};
