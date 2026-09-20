import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db";
import { signAccessToken, signRefreshToken, verifyRefreshToken, requireAuth, AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { asyncHandler } from "../middleware/asyncHandler";
import { env } from "../config/env";
import { authRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueTokens(res: any, userId: string, email: string): Promise<string> {
  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = signRefreshToken({ sub: userId });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    [uuid(), userId, hashToken(refreshToken), expiresAt]
  );

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });

  return accessToken;
}

authRouter.post(
  "/register",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
    const { email, password, name } = parsed.data;

    const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) throw new HttpError(409, "An account with this email already exists");

    const id = uuid();
    const passwordHash = bcrypt.hashSync(password, 12);
    await db.run(
      `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, email, passwordHash, name]
    );

    const accessToken = await issueTokens(res, id, email);
    res.status(201).json({ accessToken, user: { id, email, name } });
  })
);

authRouter.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid email or password");
    const { email, password } = parsed.data;

    const user = await db.get<any>(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, "Invalid email or password");
    }

    const accessToken = await issueTokens(res, user.id, user.email);
    res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token) throw new HttpError(401, "No refresh token");

    let decoded: { sub: string };
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }

    const row = await db.get<any>(
      `SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL`,
      [decoded.sub, hashToken(token)]
    );
    if (!row || new Date(row.expires_at) < new Date()) {
      throw new HttpError(401, "Refresh token expired or revoked");
    }

    const user = await db.get<any>(`SELECT * FROM users WHERE id = ?`, [decoded.sub]);
    if (!user) throw new HttpError(401, "User not found");

    // Rotate: revoke old, issue new
    await db.run(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`, [row.id]);
    const accessToken = await issueTokens(res, user.id, user.email);
    res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (token) {
      await db.run(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?`, [
        hashToken(token),
      ]);
    }
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await db.get(`SELECT id, email, name, created_at FROM users WHERE id = ?`, [req.userId]);
    if (!user) throw new HttpError(404, "User not found");
    res.json({ user });
  })
);
