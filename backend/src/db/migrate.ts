// `npm run migrate` — explicit, scriptable schema setup, independent of starting the server.
// Uses whichever engine env.databaseUrl selects (Postgres) or falls back to SQLite.
import { initDb, dbEngine } from "./index";
import { env } from "../config/env";

initDb()
  .then(() => {
    console.log(`Migration complete (${dbEngine}):`, dbEngine === "postgres" ? env.databaseUrl.replace(/:[^:@]+@/, ":****@") : env.databasePath);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
