import { describe, it, expect } from "vitest";
import "./setup";
import { encryptSecret, decryptSecret, maskSecret } from "../src/utils/crypto";
import { providers, getProvider } from "../src/providers";

describe("crypto helpers", () => {
  it("round-trips an encrypted secret", () => {
    const secret = "sk-test-1234567890abcdef";
    const enc = encryptSecret(secret);
    expect(enc).not.toBe(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("masks a secret for display", () => {
    const masked = maskSecret("sk-test-1234567890abcdef");
    expect(masked.startsWith("sk-t")).toBe(true);
    expect(masked).not.toContain("1234567890");
  });
});

describe("provider registry", () => {
  it("registers openai, anthropic and ollama", () => {
    const ids = providers.map((p) => p.id).sort();
    expect(ids).toEqual(["anthropic", "ollama", "openai"]);
  });

  it("looks providers up by id", () => {
    expect(getProvider("openai")?.label).toContain("OpenAI");
    expect(getProvider("nonexistent")).toBeUndefined();
  });

  it("openai adapter refuses to stream without a key", async () => {
    const provider = getProvider("openai")!;
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: "user", content: "hi" }], null, { model: "gpt-4o-mini" })) {
      chunks.push(chunk);
    }
    expect(chunks[0].type).toBe("error");
  });
});
