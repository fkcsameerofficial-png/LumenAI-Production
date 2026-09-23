import { db } from "../db";
import { getProvider } from "../providers";
import { ChatMessage, StreamChunk } from "../providers/base";
import { HttpError } from "../middleware/errorHandler";
import { decryptSecret } from "../utils/crypto";
import { env } from "../config/env";
import { readImageAsDataUrl, readTextFileForContext } from "./fileService";

interface Attachment {
  fileId: string;
  filename: string;
  kind: "image" | "text" | "file";
  storagePath: string;
  mimetype: string;
}

async function resolveApiKey(userId: string, provider: string): Promise<string | null> {
  const row = await db.get<{ encrypted_key: string }>(
    `SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?`,
    [userId, provider]
  );
  if (row) return decryptSecret(row.encrypted_key);

  if (env.allowSharedKeys) {
    if (provider === "openai" && env.openaiApiKey) return env.openaiApiKey;
    if (provider === "anthropic" && env.anthropicApiKey) return env.anthropicApiKey;
    if (provider === "gemini" && env.geminiApiKey) return env.geminiApiKey;
  }
  // Ollama needs no key at all.
  return null;
}

function buildMessageContent(content: string, attachments: Attachment[]): { text: string; images: string[] } {
  let text = content;
  const images: string[] = [];
  for (const att of attachments) {
    if (att.kind === "image") {
      images.push(readImageAsDataUrl(att.storagePath, att.mimetype));
    } else if (att.kind === "text") {
      try {
        const fileText = readTextFileForContext(att.storagePath);
        text += `\n\n--- Attached file: ${att.filename} ---\n${fileText}\n--- end of ${att.filename} ---`;
      } catch {
        text += `\n\n[Could not read attached file: ${att.filename}]`;
      }
    } else {
      text += `\n\n[Attached file: ${att.filename} (${att.mimetype}) — binary, not inlined]`;
    }
  }
  return { text, images };
}

export async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const conv = await db.get<any>(`SELECT * FROM conversations WHERE id = ?`, [conversationId]);
  if (!conv) throw new HttpError(404, "Conversation not found");

  const rows = await db.all<any>(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId]
  );

  const messages: ChatMessage[] = [];
  if (conv.system_prompt && conv.system_prompt.trim().length > 0) {
    messages.push({ role: "system", content: conv.system_prompt });
  }
  for (const row of rows) {
    const attachments: Attachment[] = JSON.parse(row.attachments || "[]");
    const { text, images } = buildMessageContent(row.content, attachments);
    messages.push({ role: row.role, content: text, images: images.length ? images : undefined });
  }
  return messages;
}

export async function* runChatCompletion(
  userId: string,
  conversationId: string,
  signal: AbortSignal
): AsyncGenerator<StreamChunk> {
  const conv = await db.get<any>(
    `SELECT * FROM conversations WHERE id = ? AND user_id = ?`,
    [conversationId, userId]
  );
  if (!conv) throw new HttpError(404, "Conversation not found");

  const provider = getProvider(conv.provider);
  if (!provider) throw new HttpError(400, `Unknown provider: ${conv.provider}`);

  const apiKey = await resolveApiKey(userId, conv.provider);
  if (provider.requiresApiKey && !apiKey) {
    yield {
      type: "error",
      message: `No API key configured for ${provider.label}. Add one in Settings → Providers.`,
    };
    return;
  }

  const messages = await loadConversationMessages(conversationId);

  yield* provider.streamChat(messages, apiKey, {
    model: conv.model,
    signal,
  });
}
