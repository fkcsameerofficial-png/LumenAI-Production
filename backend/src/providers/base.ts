export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  // Optional images as data URLs (base64), for vision-capable models.
  images?: string[];
}

export interface StreamChunk {
  type: "token" | "done" | "error";
  text?: string;
  message?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  supportsImages: boolean;
  contextWindow?: number;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Every AI provider Lumen talks to (OpenAI-compatible, Anthropic, Ollama, or any future
 * provider) implements this single interface. The rest of the app — routes, chatService,
 * the frontend model selector — only ever depends on this interface, never on a specific
 * vendor's SDK. Adding a new provider means creating one file and registering it below.
 */
export interface ChatProvider {
  id: string;
  label: string;
  requiresApiKey: boolean;

  listModels(apiKey: string | null): Promise<ModelInfo[]>;

  /**
   * Stream a chat completion. Must yield StreamChunk objects and must respect
   * options.signal for cancellation (stop-generation button in the UI).
   */
  streamChat(
    messages: ChatMessage[],
    apiKey: string | null,
    options: ChatOptions
  ): AsyncGenerator<StreamChunk>;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
