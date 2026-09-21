import dotenv from "dotenv";
import path from "path";

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return "insecure-dev-default-" + name;
  }
  return v;
}

export const env = {
  port: parseInt(process.env.PORT ?? "8787", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  jwtSecret: required("JWT_SECRET"),
  refreshSecret: required("REFRESH_SECRET"),
  encryptionKey: required("ENCRYPTION_KEY"),

  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "30d",

  // If DATABASE_URL is set (e.g. Render's managed PostgreSQL), the app uses Postgres and
  // ignores databasePath entirely. Otherwise it falls back to the local SQLite file — this
  // is what keeps local/dev usage exactly as it was before Postgres support was added.
  databaseUrl: process.env.DATABASE_URL ?? "",
  databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/lumen.db"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads"),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? "20", 10),

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? "120", 10),

  allowSharedKeys: (process.env.ALLOW_SHARED_KEYS ?? "false") === "true",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
};
