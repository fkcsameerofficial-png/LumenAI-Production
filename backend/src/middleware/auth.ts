import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthedRequest extends Request {
  userId?: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtl as any });
}

export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, env.refreshSecret, { expiresIn: env.refreshTokenTtl as any });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.refreshSecret) as { sub: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    req.userId = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
}
