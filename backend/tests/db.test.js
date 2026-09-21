"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
require("./setup");
const db_1 = require("../src/db");
const setup_1 = require("./setup");
const uuid_1 = require("uuid");
(0, vitest_1.describe)("db adapter (SQLite path)", () => {
    (0, vitest_1.beforeAll)(async () => {
        await (0, db_1.initDb)();
    });
    (0, vitest_1.afterAll)(() => (0, setup_1.cleanupTestDb)());
    (0, vitest_1.it)("supports run/get/all against the real schema", async () => {
        const id = (0, uuid_1.v4)();
        await db_1.db.run(`INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`, [id, `adapter-${id}@example.com`, "hash", "Adapter Test"]);
        const row = await db_1.db.get(`SELECT * FROM users WHERE id = ?`, [id]);
        (0, vitest_1.expect)(row?.name).toBe("Adapter Test");
        const rows = await db_1.db.all(`SELECT * FROM users WHERE id = ?`, [id]);
        (0, vitest_1.expect)(rows).toHaveLength(1);
    });
});
//# sourceMappingURL=db.test.js.map