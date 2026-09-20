import { API_BASE, getAccessToken } from "./client";

export type StreamEvent =
  | { type: "user_message"; id: string }
  | { type: "token"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; messageId: string };

/**
 * POSTs a new message to a conversation and streams the SSE response back, since browsers'
 * built-in EventSource only supports GET requests. Returns an object with the pending fetch
 * promise plus an `abort()` you can call to stop generation mid-stream.
 */
export function streamMessage(
  conversationId: string,
  payload: { content: string; attachmentIds?: string[] },
  onEvent: (event: StreamEvent) => void
): { abort: () => void; done: Promise<void> } {
  const controller = new AbortController();

  const done = (async () => {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      onEvent({ type: "error", message: text || `Request failed (${res.status})` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = rawEvent.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const parsed = JSON.parse(line.slice(5).trim());
          onEvent(parsed);
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  })();

  return { abort: () => controller.abort(), done };
}
