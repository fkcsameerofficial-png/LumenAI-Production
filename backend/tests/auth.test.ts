import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "./setup";
import request from "supertest";
import { initDb } from "../src/db";
import { createApp } from "../src/app";
import { cleanupTestDb } from "./setup";

let app: ReturnType<typeof createApp>;

describe("auth flow", () => {
  beforeAll(async () => {
    await initDb();
    app = createApp();
  });
  afterAll(() => cleanupTestDb());

  it("rejects registration with a short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "short@example.com", password: "abc", name: "Short" });
    expect(res.status).toBe(400);
  });

  it("registers, logs in, and fetches the current user", async () => {
    const email = `user-${Date.now()}@example.com`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "correcthorse123", name: "Test User" });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.user.email).toBe(email);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "correcthorse123" });
    expect(login.status).toBe(200);
    const token = login.body.accessToken;

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it("rejects login with wrong password", async () => {
    const email = `user2-${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({ email, password: "correcthorse123", name: "U2" });
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
