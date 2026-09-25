import fs from "fs";
import path from "path";
import { env } from "../config/env";
import { SCHEMA } from "./schema";
import { logger } from "../utils/logger";

/**
 * Every route/service in this app talks to the database through this one small async
 * interface — regardless of whether the underlying engine is local SQLite (used for local
 * development, matching the project's original design) or PostgreSQL (used in production on
 * Render, where the filesystem is not persistent across deploys/restarts on the free tier).
 *
 * All existing SQL text (written for SQLite, using "?" placeholders) is preserved as-is
 * everywhere it's used — the small set of SQLite-specific syntax it relies on
 * (`datetime('now')`, `?` placeholders, `LIKE`) is translated to its PostgreSQL equivalent in
 * one place (`toPgSql`) rather than by rewriting every query.
 */
export interface DbAdapter {
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<void>;
}

function toPgSql(sql: string): string {
  let translated = sql
    .replace(/datetime\('now'\)/g, "NOW()::text")
    .replace(/\bLIKE\b/g, "ILIKE");
  let i = 0;
  translated = translated.replace(/\?/g, () => `$${++i}`);
  return translated;
}

class PostgresAdapter implements DbAdapter {
  private pool: import("pg").Pool;

  constructor(connectionString: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require("pg");
    this.pool = new Pool({
      connectionString,
      // Render's managed PostgreSQL requires SSL but presents a certificate that Node's
      // default trust store won't validate; this is the standard, documented workaround
      // (equivalent to `sslmode=require` rather than `verify-full`).
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }

  async init() {
    const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await this.pool.query(toPgSql(stmt));
    }
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    const res = await this.pool.query(toPgSql(sql), params);
    return res.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pool.query(toPgSql(sql), params);
    return res.rows as T[];
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    await this.pool.query(toPgSql(sql), params);
  }
}

class SqliteAdapter implements DbAdapter {
  private handle: import("better-sqlite3").Database;

  constructor(filePath: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.handle = new Database(filePath);
    this.handle.pragma("journal_mode = WAL");
    this.handle.pragma("foreign_keys = ON");
    this.handle.exec(SCHEMA);
  }

  async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.handle.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.handle.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    this.handle.prepare(sql).run(...params);
  }
}

// A live binding: assigned once by initDb() before the server starts accepting requests.
// Every file that does `import { db } from "../db"` and calls `db.get/all/run(...)` inside a
// request handler (i.e. after startup) sees the real adapter — only code that ran at module
// load time (there is none) would see it unset.
export let db: DbAdapter;
export let dbEngine: "postgres" | "sqlite" = "sqlite";

export async function initDb(): Promise<void> {
  if (env.databaseUrl) {
    dbEngine = "postgres";
    const adapter = new PostgresAdapter(env.databaseUrl);
    await adapter.init();
    db = adapter;
    logger.info("Connected to PostgreSQL (production database)");
  } else {
    dbEngine = "sqlite";
    fs.mkdirSync(env.uploadDir, { recursive: true });
    db = new SqliteAdapter(env.databasePath);
    logger.info({ path: env.databasePath }, "Using local SQLite database (development)");
  }

  // Keep existing SQLite and Postgres installations compatible with additive schema changes.
  for (const column of [
    "ALTER TABLE agent_tasks ADD COLUMN iteration INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE agent_tasks ADD COLUMN max_iterations INTEGER NOT NULL DEFAULT 8",
    "ALTER TABLE agent_tasks ADD COLUMN changed_files TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try {
      await db.run(column);
    } catch {
      // The column already exists on databases initialized with the current schema.
    }
  }
}
