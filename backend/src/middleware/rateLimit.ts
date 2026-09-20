import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// This is an abuse-protection guard only — it is intentionally generous and configurable via
// .env. It is NOT a product usage cap: legitimate usage is bounded only by whatever the
// upstream AI provider allows for the user's own API key.
export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

export const authRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again shortly." },
});
