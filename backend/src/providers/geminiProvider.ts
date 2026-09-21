import { ChatMessage, ChatOptions, ChatProvider, ModelInfo, StreamChunk } from "./base";
import { env } from "../config/env";

export const geminiProvider: ChatProvider = {
  id: "gemini",
  label: "Google Gemini",
  requiresApiKey: true,

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", supportsImages: true },
    ];
  },

  async *streamChat(
    messages: ChatMessage[],
    apiKey: string | null,
    options: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const key = apiKey || env.geminiApiKey;

    if (!key) {
      yield { type: "error", message: "No Gemini API key configured." };
      return;
    }

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    const body: any = { contents };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    let res: Response;

    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: options.signal,
        }
      );
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Failed to reach Gemini API: ${err.message}` };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      yield {
        type: "error",
        message: `Gemini error (${res.status}): ${text.slice(0, 500)}`,
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          try {
            const json = JSON.parse(line.slice(5).trim());
            const text =
              json.candidates?.[0]?.content?.parts
                ?.map((p: any) => p.text ?? "")
                .join("") ?? "";

            if (text) yield { type: "token", text };
          } catch {
            // Ignore incomplete SSE chunks.
          }
        }
      }

      yield { type: "done" };
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", message: `Gemini stream interrupted: ${err.message}` };
    } finally {
      reader.releaseLock();
    }
  },
};
