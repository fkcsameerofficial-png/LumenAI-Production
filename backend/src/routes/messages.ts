import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { asyncHandler } from "../middleware/asyncHandler";
import { runChatCompletion } from "../services/chatService";
import { getFileRecord } from "../services/fileService";
import { logger } from "../utils/logger";

export const messagesRouter = Router({ mergeParams: true });
messagesRouter.use(requireAuth);

const sendSchema = z.object({
  content: z.string().max(50000),
  attachmentIds: z.array(z.string()).optional(),
});

async function ownedConversation(id: string, userId: string) {
  const conv = await db.get<any>(`SELECT * FROM conversations WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!conv) throw new HttpError(404, "Conversation not found");
  return conv;
}

function autoTitleFrom(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? clean.slice(0, 57) + "..." : clean || "New chat";
}

/**
 * POST /api/conversations/:id/messages
 * Saves the user's message, then streams the assistant's reply back over SSE.
 * Event stream sends: {type:"token", text} repeatedly, then {type:"done", messageId}
 * or {type:"error", message}.
 */
messagesRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversationId = req.params.id;
    const conv = await ownedConversation(conversationId, req.userId!);

    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { content, attachmentIds = [] } = parsed.data;

    // Validate attachments belong to this user, and attach them to this conversation.
    const attachments = [];
    for (const fid of attachmentIds) {
      const f = await getFileRecord(fid, req.userId!);
      await db.run(`UPDATE files SET conversation_id = ? WHERE id = ?`, [conversationId, fid]);
      attachments.push({ fileId: f.id, filename: f.filename, kind: f.kind, storagePath: f.storage_path, mimetype: f.mimetype });
    }

    const userMsgId = uuid();
    await db.run(
      `INSERT INTO messages (id, conversation_id, role, content, attachments, created_at)
       VALUES (?, ?, 'user', ?, ?, datetime('now'))`,
      [userMsgId, conversationId, content, JSON.stringify(attachments)]
    );

    // Auto-title new conversations from the first user message.
    const countRow = await db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?`,
      [conversationId]
    );
    const isFirstMessage = Number(countRow?.c) === 1;
    if (isFirstMessage && (conv.title === "New chat" || !conv.title)) {
      await db.run(`UPDATE conversations SET title = ? WHERE id = ?`, [autoTitleFrom(content), conversationId]);
    }
    await db.run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, [conversationId]);

    // --- Set up SSE ---
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: "user_message", id: userMsgId });

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    let fullText = "";
    let errored: string | null = null;

    try {
      for await (const chunk of runChatCompletion(req.userId!, conversationId, controller.signal)) {
        if (chunk.type === "token" && chunk.text) {
          fullText += chunk.text;
          send({ type: "token", text: chunk.text });
        } else if (chunk.type === "error") {
          errored = chunk.message ?? "Unknown provider error";
          send({ type: "error", message: errored });
        } else if (chunk.type === "done") {
          break;
        }
      }
    } catch (err: any) {
      logger.error({ err }, "Chat streaming failed");
      errored = err.message ?? "Streaming failed";
      send({ type: "error", message: errored });
    }

    const assistantMsgId = uuid();
    if (fullText.trim().length > 0 || errored) {
      await db.run(
        `INSERT INTO messages (id, conversation_id, role, content, error, created_at)
         VALUES (?, ?, 'assistant', ?, ?, datetime('now'))`,
        [assistantMsgId, conversationId, fullText, errored]
      );
      await db.run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, [conversationId]);
    }

    send({ type: "done", messageId: assistantMsgId });
    res.end();
  })
);

messagesRouter.delete(
  "/:messageId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedConversation(req.params.id, req.userId!);
    await db.run(`DELETE FROM messages WHERE id = ? AND conversation_id = ?`, [req.params.messageId, req.params.id]);
    res.status(204).send();
  })
);
