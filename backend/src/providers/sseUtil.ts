/**
 * Shared helper: reads a fetch() Response whose body is an SSE ("text/event-stream") or
 * newline-delimited-JSON stream, and yields each raw "data:" payload (or raw line for NDJSON)
 * as a string, already stripped of the "data: " prefix. Used by the OpenAI, Anthropic and
 * Ollama adapters so each one only has to know its own JSON shape, not stream plumbing.
 */
export async function* iterateSseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!rawLine) continue;
        if (rawLine.startsWith("data:")) {
          yield rawLine.slice(5).trim();
        } else if (rawLine.startsWith("{")) {
          // NDJSON stream (Ollama): each line is a standalone JSON object
          yield rawLine;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
