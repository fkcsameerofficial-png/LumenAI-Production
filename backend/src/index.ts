import { initDb } from "./db";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

async function main() {
  await initDb();
  const app = createApp();

  // Bind explicitly to 0.0.0.0 (not just "localhost") — required for the app to be reachable
  // on platforms like Render, which route external traffic to the container's exposed port.
  app.listen(env.port, "0.0.0.0", () => {
    logger.info(`Lumen backend listening on 0.0.0.0:${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
