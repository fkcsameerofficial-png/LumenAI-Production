import { Router } from "express";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { providers } from "../providers";
import { decryptSecret } from "../utils/crypto";
import { env } from "../config/env";

export const modelsRouter = Router();
modelsRouter.use(requireAuth);

// GET /api/models -> for every registered provider, list its models plus whether the
// current user has a usable key for it (so the frontend can grey out unusable providers).
modelsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const userKeyRows = await db.all<{ provider: string }>(
      `SELECT provider FROM api_keys WHERE user_id = ?`,
      [req.userId]
    );
    const ownedProviders = new Set(userKeyRows.map((k) => k.provider));

    const result = await Promise.all(
      providers.map(async (p) => {
        let apiKey: string | null = null;
        const row = await db.get<{ encrypted_key: string }>(
          `SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?`,
          [req.userId, p.id]
        );
        if (row) apiKey = decryptSecret(row.encrypted_key);
        else if (env.allowSharedKeys) {
          if (p.id === "openai" && env.openaiApiKey) apiKey = env.openaiApiKey;
          if (p.id === "anthropic" && env.anthropicApiKey) apiKey = env.anthropicApiKey;
        }

        const models = await p.listModels(apiKey);
        const usable = !p.requiresApiKey || Boolean(apiKey) || ownedProviders.has(p.id);
        return { id: p.id, label: p.label, requiresApiKey: p.requiresApiKey, usable, models };
      })
    );

    res.json({ providers: result });
  })
);
