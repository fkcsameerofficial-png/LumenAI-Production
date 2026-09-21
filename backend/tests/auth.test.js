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
(0, vitest_1.describe)("auth flow", () => {
    (0, vitest_1.beforeAll)(async () => {
        await (0, db_1.initDb)();
        app = (0, app_1.createApp)();
    });
    (0, vitest_1.afterAll)(() => (0, setup_1.cleanupTestDb)());
    (0, vitest_1.it)("rejects registration with a short password", async () => {
        const res = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ email: "short@example.com", password: "abc", name: "Short" });
        (0, vitest_1.expect)(res.status).toBe(400);
    });
    (0, vitest_1.it)("registers, logs in, and fetches the current user", async () => {
        const email = `user-${Date.now()}@example.com`;
        const reg = await (0, supertest_1.default)(app)
            .post("/api/auth/register")
            .send({ email, password: "correcthorse123", name: "Test User" });
        (0, vitest_1.expect)(reg.status).toBe(201);
        (0, vitest_1.expect)(reg.body.accessToken).toBeTruthy();
        (0, vitest_1.expect)(reg.body.user.email).toBe(email);
        const login = await (0, supertest_1.default)(app)
            .post("/api/auth/login")
            .send({ email, password: "correcthorse123" });
        (0, vitest_1.expect)(login.status).toBe(200);
        const token = login.body.accessToken;
        const me = await (0, supertest_1.default)(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(me.status).toBe(200);
        (0, vitest_1.expect)(me.body.user.email).toBe(email);
    });
    (0, vitest_1.it)("rejects login with wrong password", async () => {
        const email = `user2-${Date.now()}@example.com`;
        await (0, supertest_1.default)(app).post("/api/auth/register").send({ email, password: "correcthorse123", name: "U2" });
        const res = await (0, supertest_1.default)(app).post("/api/auth/login").send({ email, password: "wrongpassword" });
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)("rejects protected routes without a token", async () => {
        const res = await (0, supertest_1.default)(app).get("/api/auth/me");
        (0, vitest_1.expect)(res.status).toBe(401);
    });
});
//# sourceMappingURL=auth.test.js.map