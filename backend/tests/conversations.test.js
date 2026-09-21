"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
require("./setup");
const supertest_1 = __importDefault(require("supertest"));
const db_1 = require("../src/db");
const app_1 = require("../src/app");
const setup_1 = require("./setup");
let app;
let token;
(0, vitest_1.describe)("conversations CRUD", () => {
    (0, vitest_1.beforeAll)(async () => {
        await (0, db_1.initDb)();
        app = (0, app_1.createApp)();
        const email = `conv-${Date.now()}@example.com`;
        const reg = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ email, password: "correcthorse123", name: "Conv User" });
        token = reg.body.accessToken;
    });
    (0, vitest_1.afterAll)(() => (0, setup_1.cleanupTestDb)());
    (0, vitest_1.it)("creates, lists, updates, and deletes a conversation", async () => {
        const create = await (0, supertest_1.default)(app)
            .post("/api/conversations")
            .set("Authorization", `Bearer ${token}`)
            .send({ provider: "ollama", model: "llama3" });
        (0, vitest_1.expect)(create.status).toBe(201);
        const id = create.body.conversation.id;
        const list = await (0, supertest_1.default)(app)
            .get("/api/conversations")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(list.status).toBe(200);
        (0, vitest_1.expect)(list.body.conversations.some((c) => c.id === id)).toBe(true);
        const rename = await (0, supertest_1.default)(app)
            .patch(`/api/conversations/${id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "Renamed chat", pinned: true });
        (0, vitest_1.expect)(rename.status).toBe(200);
        (0, vitest_1.expect)(rename.body.conversation.title).toBe("Renamed chat");
        (0, vitest_1.expect)(rename.body.conversation.pinned).toBe(1);
        const del = await (0, supertest_1.default)(app)
            .delete(`/api/conversations/${id}`)
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(del.status).toBe(204);
        const getAfterDelete = await (0, supertest_1.default)(app)
            .get(`/api/conversations/${id}`)
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(getAfterDelete.status).toBe(404);
    });
    (0, vitest_1.it)("refuses to touch another user's conversation", async () => {
        const create = await (0, supertest_1.default)(app)
            .post("/api/conversations")
            .set("Authorization", `Bearer ${token}`)
            .send({});
        const id = create.body.conversation.id;
        const otherReg = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ email: `other-${Date.now()}@example.com`, password: "correcthorse123", name: "Other" });
        const otherToken = otherReg.body.accessToken;
        const res = await (0, supertest_1.default)(app)
            .get(`/api/conversations/${id}`)
            .set("Authorization", `Bearer ${otherToken}`);
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
//# sourceMappingURL=conversations.test.js.map