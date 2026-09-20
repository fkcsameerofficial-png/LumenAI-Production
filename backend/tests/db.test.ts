import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import { initDb, db } from "../src/db";
import { cleanupTestDb } from "./setup";
import { v4 as uuid } from "uuid";

describe("db adapter (SQLite path)", () => {
  beforeAll(async () => {
    await initDb();
  });
  afterAll(() => cleanupTestDb());

  it("supports run/get/all against the real schema", async () => {
    const id = uuid();
    await db.run(
      `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, `adapter-${id}@example.com`, "hash", "Adapter Test"]
    );
    const row = await db.get<any>(`SELECT * FROM users WHERE id = ?`, [id]);
    expect(row?.name).toBe("Adapter Test");

    const rows = await db.all<any>(`SELECT * FROM users WHERE id = ?`, [id]);
    expect(rows).toHaveLength(1);
  });
});
