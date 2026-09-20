import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import fs from "fs";
import path from "path";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { apiRateLimiter } from "./middleware/rateLimit";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { messagesRouter } from "./routes/messages";
import { filesRouter } from "./routes/files";
import { modelsRouter } from "./routes/models";
import { apiKeysRouter } from "./routes/apiKeys";

export function createApp() {
  const app = express();

  app.use(
    helmet({
      // The SPA is served from this same process in production (see static serving below),
      // so a strict default CSP would block the app's own inline-free bundle unnecessarily;
      // Vite's build output works fine with helmet's other protections left on.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));
  app.use("/api", apiRateLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/conversations/:id/messages", messagesRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/models", modelsRouter);
  app.use("/api/api-keys", apiKeysRouter);

  // --- Serve the built frontend (single Render Web Service architecture) ---
  // The Render build command builds the Vite frontend and copies its output into
  // backend/dist/public. If that folder isn't present (e.g. local `npm run dev`, where the
  // frontend runs as its own Vite dev server instead), this is skipped entirely and nothing
  // about local development changes.
  const publicDir = path.join(__dirname, "public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // SPA fallback: any non-API, non-file GET request serves index.html so React Router
    // can handle the route client-side. Must come after the API routes above.
    app.get(/^\/(?!api\/|health).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
    logger.info({ publicDir }, "Serving built frontend as a single service");
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
