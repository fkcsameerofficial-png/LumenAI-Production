import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { asyncHandler } from "../middleware/asyncHandler";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { q } = req.query as { q?: string };
    let rows;
    if (q && q.trim().length > 0) {
      rows = await db.all(
        `SELECT DISTINCT c.* FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.user_id = ? AND (c.title LIKE ? OR m.content LIKE ?)
         ORDER BY c.pinned DESC, c.updated_at DESC`,
        [req.userId, `%${q}%`, `%${q}%`]
      );
    } else {
      rows = await db.all(
        `SELECT * FROM conversations WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC`,
        [req.userId]
      );
    }
    res.json({ conversations: rows });
  })
);

const createSchema = z.object({
  title: z.string().max(200).optional(),
  provider: z.string().min(1).default("openai"),
  model: z.string().min(1).default("gpt-4o-mini"),
  systemPrompt: z.string().max(8000).optional(),
});

conversationsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { title, provider, model, systemPrompt } = parsed.data;

    const id = uuid();
    await db.run(
      `INSERT INTO conversations (id, user_id, title, provider, model, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, req.userId, title ?? "New chat", provider, model, systemPrompt ?? ""]
    );

    const conv = await db.get(`SELECT * FROM conversations WHERE id = ?`, [id]);
    res.status(201).json({ conversation: conv });
  })
);

async function ownedConversation(id: string, userId: string) {
  const conv = await db.get<any>(`SELECT * FROM conversations WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!conv) throw new HttpError(404, "Conversation not found");
  return conv;
}

conversationsRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const conv = await ownedConversation(req.params.id, req.userId!);
    const rows = await db.all<any>(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    const messages = rows.map((m: any) => {
      const attachments = JSON.parse(m.attachments || "[]").map((a: any) => ({
        fileId: a.fileId,
        filename: a.filename,
        kind: a.kind,
      }));
      // storagePath is an internal server filesystem path used only by chatService when
      // building provider context — never expose it to the client.
      return { ...m, attachments };
    });
    res.json({ conversation: conv, messages });
  })
);

const updateSchema = z.object({
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(8000).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  pinned: z.boolean().optional(),
});

conversationsRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedConversation(req.params.id, req.userId!);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const fields = parsed.data;

    const sets: string[] = [];
    const values: any[] = [];
    if (fields.title !== undefined) { sets.push("title = ?"); values.push(fields.title); }
    if (fields.systemPrompt !== undefined) { sets.push("system_prompt = ?"); values.push(fields.systemPrompt); }
    if (fields.provider !== undefined) { sets.push("provider = ?"); values.push(fields.provider); }
    if (fields.model !== undefined) { sets.push("model = ?"); values.push(fields.model); }
    if (fields.pinned !== undefined) { sets.push("pinned = ?"); values.push(fields.pinned ? 1 : 0); }
    sets.push("updated_at = datetime('now')");

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.run(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, values);
    }
    const conv = await db.get(`SELECT * FROM conversations WHERE id = ?`, [req.params.id]);
    res.json({ conversation: conv });
  })
);

conversationsRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownedConversation(req.params.id, req.userId!);
    await db.run(`DELETE FROM conversations WHERE id = ?`, [req.params.id]);
    res.status(204).send();
  })
);

// --- Export / import ---

conversationsRouter.get(
  "/:id/export",
  asyncHandler(async (req: AuthedRequest, res) => {
    const conv = (await ownedConversation(req.params.id, req.userId!)) as any;
    const messages = await db.all(
      `SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({
      exportedFrom: "Lumen",
      version: 1,
      conversation: { title: conv.title, systemPrompt: conv.system_prompt, provider: conv.provider, model: conv.model },
      messages,
    });
  })
);

const importSchema = z.object({
  conversation: z.object({
    title: z.string().optional(),
    systemPrompt: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
  }),
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })),
});

conversationsRouter.post(
  "/import",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid import file format");
    const { conversation, messages } = parsed.data;

    const id = uuid();
    await db.run(
      `INSERT INTO conversations (id, user_id, title, provider, model, system_prompt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        id,
        req.userId,
        conversation.title ?? "Imported chat",
        conversation.provider ?? "openai",
        conversation.model ?? "gpt-4o-mini",
        conversation.systemPrompt ?? "",
      ]
    );

    for (const m of messages) {
      await db.run(
        `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuid(), id, m.role, m.content]
      );
    }

    const conv = await db.get(`SELECT * FROM conversations WHERE id = ?`, [id]);
    res.status(201).json({ conversation: conv });
  })
);
