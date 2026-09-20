import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { encryptSecret, maskSecret } from "../utils/crypto";
import { providers } from "../providers";

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth);

apiKeysRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db.all(
      `SELECT id, provider, label, masked_preview, created_at FROM api_keys WHERE user_id = ?`,
      [req.userId]
    );
    res.json({ apiKeys: rows });
  })
);

const upsertSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1).max(60).default("Default"),
  apiKey: z.string().min(1),
});

apiKeysRouter.put(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { provider, label, apiKey } = parsed.data;

    if (!providers.some((p) => p.id === provider)) {
      throw new HttpError(400, `Unknown provider: ${provider}`);
    }

    const encrypted = encryptSecret(apiKey);
    const masked = maskSecret(apiKey);

    const existing = await db.get<{ id: string }>(
      `SELECT id FROM api_keys WHERE user_id = ? AND provider = ?`,
      [req.userId, provider]
    );

    if (existing) {
      await db.run(`UPDATE api_keys SET label = ?, encrypted_key = ?, masked_preview = ? WHERE id = ?`, [
        label,
        encrypted,
        masked,
        existing.id,
      ]);
    } else {
      await db.run(
        `INSERT INTO api_keys (id, user_id, provider, label, encrypted_key, masked_preview, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [uuid(), req.userId, provider, label, encrypted, masked]
      );
    }

    res.status(200).json({ ok: true, provider, maskedPreview: masked });
  })
);

apiKeysRouter.delete(
  "/:provider",
  asyncHandler(async (req: AuthedRequest, res) => {
    await db.run(`DELETE FROM api_keys WHERE user_id = ? AND provider = ?`, [req.userId, req.params.provider]);
    res.status(204).send();
  })
);
