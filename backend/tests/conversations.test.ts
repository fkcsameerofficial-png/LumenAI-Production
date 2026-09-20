import { describe, it, expect, afterAll, beforeAll } from "vitest";
import "./setup";
import request from "supertest";
import { initDb } from "../src/db";
import { createApp } from "../src/app";
import { cleanupTestDb } from "./setup";

let app: ReturnType<typeof createApp>;
let token: string;

describe("conversations CRUD", () => {
  beforeAll(async () => {
    await initDb();
    app = createApp();
    const email = `conv-${Date.now()}@example.com`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "correcthorse123", name: "Conv User" });
    token = reg.body.accessToken;
  });

  afterAll(() => cleanupTestDb());

  it("creates, lists, updates, and deletes a conversation", async () => {
    const create = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "ollama", model: "llama3" });
    expect(create.status).toBe(201);
    const id = create.body.conversation.id;

    const list = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.conversations.some((c: any) => c.id === id)).toBe(true);

    const rename = await request(app)
      .patch(`/api/conversations/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Renamed chat", pinned: true });
    expect(rename.status).toBe(200);
    expect(rename.body.conversation.title).toBe("Renamed chat");
    expect(rename.body.conversation.pinned).toBe(1);

    const del = await request(app)
      .delete(`/api/conversations/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/conversations/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it("refuses to touch another user's conversation", async () => {
    const create = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const id = create.body.conversation.id;

    const otherReg = await request(app)
      .post("/api/auth/register")
      .send({ email: `other-${Date.now()}@example.com`, password: "correcthorse123", name: "Other" });
    const otherToken = otherReg.body.accessToken;

    const res = await request(app)
      .get(`/api/conversations/${id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});
